/**
 * Edge Function `onboarding-goals` : « Couverture de tes objectifs » de
 * l'onboarding, AVANT la création du compte (donc sans session).
 *
 * Entrée : {
 *   product: { ean?, name, brand?, score?, ingredients: string[] },
 *   goals: string[],            // objectifs cochés (clés du parcours)
 *   customGoals?: string[],     // objectif libre « Autre » (1 au plus utile)
 *   profile: { skinFace?, sensitive?, bodySkin?, concerns?, otherConcerns?, hair?, restrictions? },
 * }
 * Sortie : { ratings: Record<clé, 0..3>, custom: Record<index, 0..3>, suggested: [{ key, why }] }
 *
 * L'IA juge seulement ; le % est calculé côté app par le moteur déterministe
 * de goals-coverage/core.ts. Les notes produit × objectif ne dépendent pas de
 * la personne : elles sont gardées en cache pour tous (ai_cache), une seule
 * lecture IA par produit. Les suggestions sont gardées par profil identique.
 *
 * Publique (verify_jwt=false, pas de compte à ce stade) : bornée par un
 * rate-limit IP, aucun crédit, entrées nettoyées et tronquées.
 */
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/auth.ts";
import { getCached, hasOpenAI, logAI, openai, setCached, sha256Hex } from "../_shared/aiClient.ts";
import {
  cleanList,
  clean,
  GOAL_PROMPT_LABELS,
  isOnboardingGoal,
  ONBOARDING_GOAL_KEYS,
  ONBOARDING_GOALS_VERSION,
  type OnboardingGoalKey,
  type OnboardingProduct,
  type OnboardingProfile,
  parseRatings,
  parseSuggestions,
  RATE_SYS,
  ratingsPrompt,
  suggestionCount,
  SUGGEST_SYS,
  suggestPrompt,
} from "./core.ts";

const V = ONBOARDING_GOALS_VERSION;
/** Les notes produit ne dépendent pas de la consigne des suggestions : version à part. */
const RATE_V = 1;
const AI_TIMEOUT_MS = 20_000;
const RATE_MAX = 30;
const RATE_WINDOW_SEC = 600;

function clientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "0.0.0.0";
}

async function callJson(system: string, user: string): Promise<string | null> {
  const r = await openai().chat.completions.create(
    {
      model: "gpt-5-mini",
      reasoning_effort: "low",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    } as never,
    { timeout: AI_TIMEOUT_MS, maxRetries: 1 },
  );
  // deno-lint-ignore no-explicit-any
  return (r as any).choices?.[0]?.message?.content ?? null;
}

async function productKey(p: OnboardingProduct): Promise<string> {
  const ean = clean(p.ean, 20);
  if (/^\d{8,14}$/.test(ean)) return `ean:${ean}`;
  const list = p.ingredients.map((i) => i.toLowerCase()).join(",");
  return `inci:${(await sha256Hex(list)).slice(0, 32)}`;
}

Deno.serve(async (req: Request): Promise<Response> => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") return jsonResponse({ error: "Méthode non autorisée." }, { status: 405 });
  if (!hasOpenAI()) return jsonResponse({ error: "IA indisponible." }, { status: 503 });

  // Rate-limit IP (pas de compte à ce stade de l'onboarding).
  try {
    const { data } = await serviceClient().rpc("cosme_check_check_rate_limit", {
      p_key: `onb-goals:${clientIp(req.headers)}`,
      p_max: RATE_MAX,
      p_window_sec: RATE_WINDOW_SEC,
    });
    if (data && (data as { ok?: boolean }).ok === false) {
      return jsonResponse({ error: "Trop de requêtes. Réessaye dans un instant." }, { status: 429 });
    }
  } catch {
    // rate-limit indisponible : on continue (le cache absorbe l'essentiel)
  }

  // deno-lint-ignore no-explicit-any
  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Requête invalide." }, { status: 400 });
  }

  const product: OnboardingProduct = {
    ean: clean(body?.product?.ean, 20) || null,
    name: clean(body?.product?.name, 120),
    brand: clean(body?.product?.brand, 60) || null,
    score: typeof body?.product?.score === "number" ? Math.max(0, Math.min(20, body.product.score)) : null,
    ingredients: cleanList(body?.product?.ingredients, 60, 60),
  };
  if (!product.name || product.ingredients.length === 0) {
    return jsonResponse({ error: "Produit incomplet." }, { status: 400 });
  }
  const goals = (Array.isArray(body?.goals) ? body.goals : []).filter(isOnboardingGoal) as OnboardingGoalKey[];
  const customGoals = cleanList(body?.customGoals, 2, 120);
  const profile: OnboardingProfile = {
    skinFace: clean(body?.profile?.skinFace, 30) || null,
    sensitive: body?.profile?.sensitive === true,
    bodySkin: clean(body?.profile?.bodySkin, 30) || null,
    concerns: cleanList(body?.profile?.concerns, 12, 40),
    otherConcerns: clean(body?.profile?.otherConcerns, 120) || null,
    hair: cleanList(body?.profile?.hair, 8, 40),
    restrictions: cleanList(body?.profile?.restrictions, 8, 40),
  };

  const t0 = Date.now();
  const pKey = await productKey(product);

  // 1. Notes produit × objectifs du parcours (cache pour tous).
  const rateCacheKey = `onb-goals:v${RATE_V}:rate:${pKey}`;
  const ratingsTask = (async (): Promise<Record<string, number>> => {
    const cached = await getCached<Record<string, number>>(rateCacheKey);
    if (cached && typeof cached === "object") return cached;
    const all = ONBOARDING_GOAL_KEYS.map((k) => ({ key: k, label: GOAL_PROMPT_LABELS[k] }));
    const keys = all.map((g) => g.key);
    let r = parseRatings(await callJson(RATE_SYS, ratingsPrompt(product, all)), keys);
    // Réponse incomplète : une seconde lecture, on ne garde en cache que du complet.
    if (Object.keys(r).length < keys.length) {
      r = { ...parseRatings(await callJson(RATE_SYS, ratingsPrompt(product, all)), keys), ...r };
    }
    if (Object.keys(r).length === keys.length) await setCached(rateCacheKey, r);
    return r;
  })();

  // 2. Objectif libre (propre à la personne : pas de cache).
  const customTask = (async (): Promise<Record<string, number>> => {
    if (customGoals.length === 0) return {};
    const list = customGoals.map((label, i) => ({ key: `custom_${i}`, label }));
    return parseRatings(await callJson(RATE_SYS, ratingsPrompt(product, list)), list.map((g) => g.key));
  })();

  // 3. Suggestions, seulement sous 3 objectifs (cache par profil identique).
  const count = suggestionCount(goals.length + customGoals.length);
  const suggestTask = (async () => {
    if (count === 0) return [];
    const candidates = ONBOARDING_GOAL_KEYS.filter((k) => !goals.includes(k));
    const sig = await sha256Hex(JSON.stringify({ profile, goals: [...goals].sort(), count }));
    const cacheKey = `onb-goals:v${V}:suggest:${sig.slice(0, 32)}`;
    const cached = await getCached<{ key: OnboardingGoalKey; why: string }[]>(cacheKey);
    if (Array.isArray(cached)) return cached;
    const s = parseSuggestions(await callJson(SUGGEST_SYS, suggestPrompt(profile, candidates, count)), candidates, count);
    if (s.length > 0) await setCached(cacheKey, s);
    return s;
  })();

  try {
    const [ratings, custom, suggested] = await Promise.all([ratingsTask, customTask, suggestTask]);
    logAI({ feature: "goals_coverage", provider: "openai", status: "success", model: "gpt-5-mini", duration_ms: Date.now() - t0 });
    return jsonResponse({ ratings, custom, suggested, version: V });
  } catch (e) {
    logAI({ feature: "goals_coverage", provider: "openai", status: "error", model: "gpt-5-mini", duration_ms: Date.now() - t0 });
    return jsonResponse({ error: e instanceof Error ? e.message : "Erreur IA." }, { status: 502 });
  }
});
