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
  primaryFunction: string | null;
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
  const tags = (ctx.tags ?? []).join(", ") || "(aucun tag connu)";
  const system =
    "Tu vulgarises un ingrédient INCI cosmétique pour un grand public francophone. Style: factuel, court, jamais alarmiste, jamais marketing. AUCUN conseil médical. Pas d'emoji. Tu rends en 3 phrases, séparées par des sauts de ligne :\n1) À quoi sert cet ingrédient (fonction principale).\n2) Pourquoi cette tolérance Vert/Jaune/Orange/Rouge selon la grille (impact santé, environnement, ou réglementaire).\n3) Une alternative ou une vigilance courte si pertinent. Si la note est Vert, dis simplement pourquoi il est considéré comme sûr.\nN'invente AUCUNE étude, AUCUNE marque, AUCUNE statistique. " +
    NO_LONG_DASHES_RULE;
  const user = `Ingrédient : ${ctx.name}
Fonction principale : ${ctx.primaryFunction ?? "non renseignée"}
Tolérance : ${ctx.colorRating ?? "non classée"}
Tags : ${tags}

Réponds avec UNIQUEMENT le texte de l'explication (3 phrases sur 3 lignes).`;

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
      primaryFunction: ing.functions?.[0]?.name ?? null,
      colorRating: ing.color_rating,
      tags: ing.tags,
    },
    user?.id ?? null,
  );

  return jsonResponse(explanation);
});
