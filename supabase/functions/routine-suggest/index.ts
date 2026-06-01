/**
 * Edge Function `routine-suggest` — port de
 * `CosmetWiki/app/api/routine/suggest/route.ts` + `lib/ai/routineSuggest.ts`
 * vers Supabase Edge (Deno).
 *
 * Recharge la routine côté serveur depuis l'utilisateur authentifié
 * (routine_items + analyses + profil), calcule les métriques déterministes,
 * puis demande à GPT 2-3 suggestions concrètes pour réduire l'exposition.
 *
 * Pipeline (mirror web) :
 *   1. Auth Bearer + rate-limit IP (gate, costCredits:0, 12/min). 401/429.
 *   2. Fan-out : routine_items(+analyses) | blocs profil + restrictions.
 *   3. computeRoutineMetrics → suggestions moteur déterministes.
 *   4. Cache par empreinte de routine (cosme_check.ai_cache). Hit → cached:true.
 *   5. Sans clé OpenAI : renvoie les suggestions moteur (dégrade proprement).
 *      Avec clé : GPT (json_object) reformule + ajoute un axe transversal,
 *      l'impact CHIFFRÉ vient du moteur (jamais inventé). Fallback moteur.
 *
 * Crédit : 0. Sortie : { suggestions:[{text,impact?}], cached }.
 */
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { gate } from "../_shared/gate.ts";
import {
  AI_MODEL,
  getCached,
  hasOpenAI,
  logAI,
  openai,
  setCached,
  sha256Hex,
} from "../_shared/aiClient.ts";
import { NO_LONG_DASHES_RULE, stripLongDashes } from "../_shared/sanitize.ts";
import {
  type AnalyseResponse,
  computeRoutineMetrics,
  type Frequency,
  loadProfileAndRestrictionsBlocks,
  type RoutineMetrics,
  type RoutineProduct,
} from "./lib.ts";

// Bump quand la structure du prompt change : invalide les anciennes réponses.
const PROMPT_VERSION = 2;

type RoutineSuggestion = {
  text: string;
  impact?: { from: number; to: number; delta: number; productName?: string | null };
};

type RoutineSuggestionsResponse = {
  suggestions: RoutineSuggestion[];
  cached: boolean;
};

/** Empreinte stable de la routine + profil + restrictions (clé de cache). */
async function fingerprint(
  products: RoutineProduct[],
  profileBlock: string | null,
  restrictionsBlock: string | null,
): Promise<string> {
  const sig = products
    .map((p) => `${p.id}:${p.frequency}:${(p.score ?? 0).toFixed(1)}`)
    .sort()
    .join("|");
  const profileKey = profileBlock ? `|prof=${(await sha256Hex(profileBlock)).slice(0, 12)}` : "";
  const restrictionsKey = restrictionsBlock
    ? `|res=${(await sha256Hex(restrictionsBlock)).slice(0, 12)}`
    : "";
  const versionKey = `|v=${PROMPT_VERSION}`;
  return (await sha256Hex(sig + profileKey + restrictionsKey + versionKey)).slice(0, 24);
}

async function generateRoutineSuggestions(
  metrics: RoutineMetrics,
  products: RoutineProduct[],
  userId: string,
  profileBlock: string | null,
  restrictionsBlock: string | null,
): Promise<RoutineSuggestionsResponse> {
  if (products.length === 0) return { suggestions: [], cached: false };

  const cacheKey = `routinetips:${await fingerprint(products, profileBlock, restrictionsBlock)}`;
  const cached = await getCached<RoutineSuggestionsResponse>(cacheKey);
  if (cached) return { ...cached, cached: true };

  // Suggestions moteur (déterministes).
  const engineSuggestions: RoutineSuggestion[] = [];
  if (
    metrics.simulation.minus1.removedName
    && metrics.simulation.minus1.exposureScore > metrics.exposureScore
  ) {
    engineSuggestions.push({
      text: `Remplacer **${metrics.simulation.minus1.removedName}** par une alternative neutre.`,
      impact: {
        from: metrics.exposureScore,
        to: metrics.simulation.minus1.exposureScore,
        delta: Number((metrics.simulation.minus1.exposureScore - metrics.exposureScore).toFixed(1)),
        productName: metrics.simulation.minus1.removedName,
      },
    });
  }
  if (metrics.allergenOverlap.length >= 2) {
    const top = metrics.allergenOverlap.slice(0, 2).map((a) => a.label).join(" et ");
    engineSuggestions.push({
      text: `Réduire l'exposition à **${top}** en cherchant des formules sans parfum.`,
    });
  }

  if (!hasOpenAI()) {
    return { suggestions: engineSuggestions.slice(0, 3), cached: false };
  }

  const facts = {
    exposureScore: metrics.exposureScore,
    exposureLabel: metrics.exposureLabel,
    topTags: metrics.tagExposure.slice(0, 5).map((t) => `${t.label} (${t.cumulativeCount.toFixed(2)}/j)`),
    topIngredients: metrics.topIngredients.map((i) => `${i.name} (${i.colorRating}, dans ${i.productCount} produits)`),
    allergenOverlap: metrics.allergenOverlap.map((a) => `${a.label} (×${a.productCount})`),
    worstProduct: metrics.simulation.minus1.removedName,
    expectedScoreIfRemoved: metrics.simulation.minus1.exposureScore,
  };

  const baseSystem =
    "Tu es un analyste de routine cosmétique. Tu reçois des FAITS CHIFFRÉS issus de l'analyse INCI de la routine de l'utilisateur. " +
    "Ton job : proposer 2 à 3 suggestions courtes et concrètes pour réduire son exposition, ADAPTÉES à son profil et à ses restrictions s'ils sont fournis. " +
    "RÈGLES STRICTES :\n" +
    "- AUCUNE marque ni nom de produit alternatif (suggère uniquement un PROFIL d'ingrédients à chercher, ex : 'shampooing sans sulfates ni parfum'). " +
    "- N'invente AUCUNE statistique ni étude. " +
    "- N'invente AUCUN ingrédient. Si tu cites un ingrédient, il doit venir des faits fournis. " +
    "- Pas d'emoji. Pas de marketing. Pas de conseil médical. " +
    "- Encadre les noms d'ingrédients ou de catégories cités avec ** (markdown gras). " +
    NO_LONG_DASHES_RULE + " " +
    "Réponds en JSON STRICT : { \"suggestions\": [\"<phrase 1>\", \"<phrase 2>\", \"<phrase 3>\"] }";

  let system = baseSystem;
  if (profileBlock) {
    system += `\n\n${profileBlock}\n\nAdapte tes suggestions au profil ci-dessus : priorise les axes qui parlent vraiment à cette personne (peau sèche → cherche les ingrédients desséchants ; cheveux secs → cherche les sulfates / alcohol denat ; allergies → cherche les allergènes du parfum).`;
  }
  if (restrictionsBlock) {
    system += `\n\n${restrictionsBlock}\n\nIMPORTANT : les familles/ingrédients ci-dessus sont DÉJÀ pris en compte par l'utilisateur. Ne lui suggère JAMAIS de "chercher un produit sans X" si X est déjà dans ses restrictions, sauf pour confirmer qu'un produit de sa routine actuelle viole cette restriction. Concentre tes suggestions sur des axes encore pertinents pour lui.`;
  }

  const userPrompt = `FAITS :
${JSON.stringify(facts, null, 2)}

Donne 2-3 suggestions concrètes${profileBlock || restrictionsBlock ? ", adaptées au profil et aux restrictions ci-dessus" : ""}.`;

  // Primaire OpenAI avec timeout 8 s ; fallback = suggestions moteur.
  const t0 = Date.now();
  let aiSuggestions: RoutineSuggestion[] = [];
  try {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const r = await Promise.race([
      openai().chat.completions.create({
        model: AI_MODEL,
        temperature: 0.5,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: userPrompt },
        ],
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("AI timeout")), 8000);
      }),
    ]);
    if (timer !== undefined) clearTimeout(timer);

    const rawContent = r.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(rawContent) as { suggestions?: unknown };
    aiSuggestions = Array.isArray(parsed.suggestions)
      ? (parsed.suggestions as unknown[])
          .filter((s): s is string => typeof s === "string")
          .map((s) => ({ text: stripLongDashes(s.trim()) }))
          .filter((s) => s.text.length > 0)
          .slice(0, 3)
      : [];

    logAI({
      feature: "synthesis",
      provider: "openai",
      status: "success",
      tokens_in: r.usage?.prompt_tokens ?? null,
      tokens_out: r.usage?.completion_tokens ?? null,
      duration_ms: Date.now() - t0,
      user_id: userId,
    });
  } catch {
    // Échec/timeout OpenAI → on dégrade sur les suggestions moteur. On loggue
    // un fallback côté moteur (pas de provider IA externe ici).
    logAI({
      feature: "synthesis",
      provider: "openai",
      status: "error",
      duration_ms: Date.now() - t0,
      user_id: userId,
    });
    return { suggestions: engineSuggestions, cached: false };
  }

  // Merge : on garde la formulation IA mais on conserve l'impact CHIFFRÉ du
  // moteur sur la 1re suggestion (le nombre est réel, jamais inventé par GPT).
  const result: RoutineSuggestionsResponse = {
    suggestions: aiSuggestions.length > 0
      ? aiSuggestions.map((s, i) => ({
          ...s,
          impact: i === 0 ? engineSuggestions[0]?.impact : undefined,
        }))
      : engineSuggestions,
    cached: false,
  };

  void setCached(cacheKey, result);
  return result;
}

Deno.serve(async (req: Request) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Méthode non autorisée." }, { status: 405 });
  }

  // ── 1. Auth + rate-limit IP (sans débit de crédit) ──────────────────────
  const g = await gate(req, {
    feature: "routine-suggest",
    costCredits: 0,
    rateMax: 12,
    rateWindowSec: 60,
  });
  if (!g.ok) return g.response;
  const { user, supabase: sb } = g;

  // ── 2. Fan-out : routine + blocs profil/restrictions ────────────────────
  const [routineRes, blocks] = await Promise.all([
    sb
      .schema("cosme_check")
      .from("routine_items")
      .select("frequency, analyses(id, name, product_label, score, result_json)"),
    loadProfileAndRestrictionsBlocks(sb, user.id),
  ]);

  const items = (routineRes.data ?? []) as unknown as {
    frequency: Frequency;
    analyses: {
      id: string;
      name: string | null;
      product_label: string | null;
      score: number | null;
      result_json: AnalyseResponse;
    } | null;
  }[];

  const products: RoutineProduct[] = items
    .filter((it) => it.analyses)
    .map((it) => ({
      id: it.analyses!.id,
      name: it.analyses!.product_label ?? it.analyses!.name ?? "Analyse",
      frequency: it.frequency,
      score: it.analyses!.score,
      result: it.analyses!.result_json,
    }));

  // ── 3-5. Métriques + suggestions ────────────────────────────────────────
  const metrics = computeRoutineMetrics(products);
  const result = await generateRoutineSuggestions(
    metrics,
    products,
    user.id,
    blocks.profileBlock,
    blocks.restrictionsBlock,
  );

  return jsonResponse(result);
});
