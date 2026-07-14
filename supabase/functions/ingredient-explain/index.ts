/**
 * Edge Function `ingredient-explain` — port de
 * `CosmetWiki/app/api/ingredient/[slug]/explain/route.ts` +
 * `CosmetWiki/lib/ai/explain.ts`.
 *
 * Explication grand-public d'un ingrédient INCI.
 *
 * Pipeline (ordre IDENTIQUE au web) :
 *   1. Public (getOptionalUser) — AUCUN crédit débité, AUCUN rate-limit gate.
 *      Le web migre POST → GET fully public pour pouvoir cacher au CDN ; ici
 *      on garde le caractère public via getOptionalUser (le userId sert
 *      uniquement au logging IA).
 *   2. Lookup ingrédient (slug → inci_id, name, color_rating, functions, tags)
 *      via le client lié au token (RLS lecture publique sur `ingredients`).
 *   3. Cache permanent `cosme_check.ingredient_explanations` (1 ligne par
 *      inci_id) : lu en premier (gratuit, servi à vie), écrit après génération.
 *   4. Sans clé OpenAI → dégradation gracieuse ("Pas d'explication...").
 *   5. Sinon GPT-4o-mini (callWithFallback) puis upsert dans le cache permanent.
 *
 * Le web renvoyait { text, personalLine, cached }. Le mobile SCINDE la
 * `personalLine` dans la fonction `ingredient-exposure` (per-user, non cachable)
 * pour que cette fonction-ci reste cachable côté CDN. Sortie ici : { text, cached }.
 *
 * Entrée : { slug } (POST body) ou ?slug= (GET). Crédit 0.
 */
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { getOptionalUser, serviceClient } from "../_shared/auth.ts";
import { AI_MODEL, hasMistral, hasOpenAI, logAI, MISTRAL_MODEL, mistralChat, openai } from "../_shared/aiClient.ts";
import { NO_LONG_DASHES_RULE, stripLongDashes } from "../_shared/sanitize.ts";

type ColorRating = "Vert" | "Jaune" | "Orange" | "Rouge";

const NO_EXPLANATION = "Pas d'explication disponible pour le moment.";

type ExplainContext = {
  inciId: number;
  name: string;
  /** Toutes les fonctions déclarées (liste non ordonnée de la base). */
  functionNames: string[];
  colorRating: ColorRating | null;
  tags: string[] | null;
};

/**
 * Cœur de `lib/ai/explain.ts` adapté : pas de personalLine ici (scindée dans
 * ingredient-exposure). Renvoie { text, cached }.
 */
async function explainIngredient(
  ctx: ExplainContext,
  userId: string | null,
): Promise<{ text: string; cached: boolean }> {
  const sb = serviceClient();

  // 1. Cache permanent (gratuit). Strip aussi à la lecture : d'anciennes
  // entrées écrites avant la règle peuvent encore contenir des cadratins.
  const { data: cached } = await sb
    .schema("cosme_check")
    .from("ingredient_explanations")
    .select("explanation")
    .eq("inci_id", ctx.inciId)
    .maybeSingle();
  if (cached?.explanation) {
    return { text: stripLongDashes(cached.explanation), cached: true };
  }

  // 2. Pas d'IA du tout → dégradation gracieuse.
  if (!hasMistral() && !hasOpenAI()) {
    return { text: NO_EXPLANATION, cached: false };
  }

  // 3. Génère une fois, puis stocke à vie.
  //
  // Prompt v2 (12 juil 2026) : DÉFINITION GÉNÉRIQUE PURE. Le texte décrit
  // l'ingrédient dans l'absolu, comme une entrée de dictionnaire ultra-
  // simplifiée. Il ne s'adresse JAMAIS au lecteur et ne renvoie JAMAIS au
  // profil de l'utilisateur, et ne donne AUCUN conseil d'achat. Le verdict
  // personnalisé ("adapté pour toi") reste le rôle exclusif de l'analyse
  // produit (personal-insights). Objectif : supprimer les contradictions où
  // cette fiche disait "privilégiez des produits sans X" pendant que l'analyse
  // jugeait le produit adapté au profil.
  // ⚠️ Si tu modifies ce prompt : re-purge la table `cosme_check.ingredient_explanations`
  // (cache permanent par inci_id, sans versionnage) sinon les anciens textes restent servis.
  const tags = (ctx.tags ?? []).join(", ") || "(aucun tag connu)";
  // La liste `functions` de la base (import INCI Beauty) n'est PAS ordonnée par
  // importance : la 1re entrée peut être une fonction marginale (ex. GLYCERIN a
  // "Dénaturant" en tête alors que son rôle réel est humectant). On donne donc
  // la liste complète au modèle et on lui demande de déduire la fonction
  // principale d'après le NOM, plutôt que de forcer functions[0].
  const functionsList = ctx.functionNames.length
    ? ctx.functionNames.slice(0, 10).join(", ")
    : "(non renseignées)";
  const system =
    "Tu rédiges une définition ultra-simplifiée d'un ingrédient INCI cosmétique pour un grand public francophone, comme une entrée de dictionnaire. Style: factuel, neutre, très court, jamais alarmiste, jamais marketing. AUCUN conseil médical, AUCUN conseil d'achat. Pas d'emoji.\n" +
    "RÈGLES ABSOLUES :\n" +
    "- Tu parles UNIQUEMENT de l'ingrédient en général, jamais d'un produit précis ni d'une personne.\n" +
    "- Tu ne t'adresses JAMAIS au lecteur : interdit d'écrire « tu », « vous », « ta peau », « votre peau », « pour toi », « pour vous ».\n" +
    "- Tu ne donnes AUCUNE recommandation d'action : interdit d'écrire « évitez », « privilégiez », « choisissez », « préférez », « vérifiez », « optez pour ».\n" +
    "- Tu ne relies l'ingrédient à AUCUN profil ni type de peau particulier de l'utilisateur.\n" +
    "- Déduis la fonction PRINCIPALE et la plus courante de l'ingrédient à partir de son NOM et de la liste de fonctions fournie ; ignore les fonctions marginales ou anecdotiques (par exemple un humectant très courant comme la glycérine n'est pas un « dénaturant »).\n" +
    "Tu rends 2 phrases, séparées par un saut de ligne :\n" +
    "1) Ce qu'est cet ingrédient et à quoi il sert (sa fonction principale), en mots simples.\n" +
    "2) De manière neutre et générale, pourquoi il porte cette tolérance (Vert/Jaune/Orange/Rouge) : une propriété factuelle de l'ingrédient (impact santé, environnemental ou réglementaire). Si la note est Vert, dis simplement pourquoi il est généralement considéré comme sûr.\n" +
    "N'invente AUCUNE étude, AUCUNE marque, AUCUNE statistique. " +
    NO_LONG_DASHES_RULE;
  const user = `Ingrédient : ${ctx.name}
Fonctions cosmétiques déclarées (liste NON ordonnée, certaines peuvent être marginales) : ${functionsList}
Tolérance : ${ctx.colorRating ?? "non classée"}
Tags : ${tags}

Réponds avec UNIQUEMENT le texte de l'explication (2 phrases sur 2 lignes), sans t'adresser au lecteur et sans aucun conseil d'achat.`;

  const messages = [
    { role: "system" as const, content: system },
    { role: "user" as const, content: user },
  ];

  // 3. Génération : MISTRAL PRIMAIRE → GPT en repli.
  let text = "";
  const t0 = Date.now();

  if (hasMistral()) {
    try {
      const raw = await mistralChat({ model: MISTRAL_MODEL, temperature: 0.4, maxTokens: 220, messages });
      const cleaned = stripLongDashes((raw ?? "").trim());
      if (cleaned) {
        text = cleaned;
        logAI({ feature: "explain", provider: "mistral", status: "success", duration_ms: Date.now() - t0, user_id: userId });
      }
    } catch {
      logAI({ feature: "explain", provider: "mistral", status: "fallback", duration_ms: Date.now() - t0, user_id: userId });
    }
  }

  // Repli GPT si Mistral indisponible / vide.
  if (!text && hasOpenAI()) {
    try {
      const r = await openai().chat.completions.create({
        model: AI_MODEL,
        temperature: 0.4,
        max_tokens: 220,
        messages,
      });
      text = stripLongDashes((r.choices?.[0]?.message?.content ?? "").trim());
      logAI({ feature: "explain", provider: "openai", status: "fallback", duration_ms: Date.now() - t0, user_id: userId });
    } catch {
      logAI({ feature: "explain", provider: "openai", status: "error", duration_ms: Date.now() - t0, user_id: userId });
    }
  }

  if (!text) {
    return { text: NO_EXPLANATION, cached: false };
  }

  // Cache permanent (une ligne par inci_id).
  await sb
    .schema("cosme_check")
    .from("ingredient_explanations")
    .upsert({ inci_id: ctx.inciId, explanation: text }, { onConflict: "inci_id" });

  return { text, cached: false };
}

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  // Public : pas de gate, pas de crédit. userId facultatif (logging IA only).
  const { user, supabase } = await getOptionalUser(req);

  // Slug : POST body { slug } ou ?slug= en query.
  let slug = "";
  if (req.method === "POST") {
    try {
      const body = (await req.json()) as { slug?: string };
      slug = (body.slug ?? "").trim();
    } catch {
      slug = "";
    }
  } else {
    slug = (new URL(req.url).searchParams.get("slug") ?? "").trim();
  }
  if (!slug) {
    return jsonResponse({ error: "Slug requis." }, { status: 400 });
  }

  // Lookup ingrédient (lecture publique via le client lié au token / anon).
  const { data, error } = await supabase
    .schema("cosme_check")
    .from("ingredients")
    .select("inci_id, name, color_rating, functions, tags")
    .eq("slug", slug)
    .maybeSingle();
  if (error || !data) {
    return jsonResponse({ error: "Ingrédient introuvable." }, { status: 404 });
  }

  const ing = data as {
    inci_id: number;
    name: string;
    color_rating: ColorRating | null;
    functions: { name?: string }[] | null;
    tags: string[] | null;
  };

  const explanation = await explainIngredient(
    {
      inciId: ing.inci_id,
      name: ing.name,
      functionNames: (ing.functions ?? [])
        .map((f) => f?.name)
        .filter((n): n is string => typeof n === "string" && n.trim().length > 0),
      colorRating: ing.color_rating,
      tags: ing.tags,
    },
    user?.id ?? null,
  );

  return jsonResponse(explanation);
});
