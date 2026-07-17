/**
 * Edge Function `goals-coverage` — « Couverture de tes objectifs » (routine).
 *
 * Pour CHAQUE objectif du profil, calcule un % de couverture par la routine.
 * Architecture HYBRIDE (demande user) :
 *   1. Pré-filtre DÉTERMINISTE (core.pairNeedsAI) : écarte gratuitement les
 *      paires produit×objectif hors sujet (déo vs hydratation) AVANT toute IA.
 *   2. L'IA (OpenAI GPT-5 / GPT-5-mini, 2-3 passes) juge UNIQUEMENT la
 *      contribution 0..3 d'un produit à un objectif.
 *   3. Le % est calculé par le moteur DÉTERMINISTE (core.computeCoverage) :
 *      pondération qualité (étoiles) + fréquence, agrégation saturante ≤ 100.
 *
 * SCALABILITÉ (1M users) : la contribution produit×objectif ne dépend PAS de
 * l'utilisateur → mise en cache CROSS-USER dans cosme_check.ai_cache (clé =
 * identité produit + version). Le coût IA est O(produits distincts), pas
 * O(users) : à l'échelle, une évaluation tape surtout le cache. Le RÉSULTAT par
 * user est persisté dans cosme_check.routine_goal_coverage (lu direct par le
 * client, sans invoquer la fonction → 0 appel edge pour l'affichage).
 *
 * Entrée : { force?: boolean }  (force = réévaluation « reload »)
 * Sortie : { state:"ok", coverage, routineSignature, goalsSignature, productCount, cached, credits }
 *        | { state:"no_goals" } | { state:"empty_routine" } | { error } (+ status)
 * Crédits : 3 débités À L'ÉVALUATION (gratuit si résultat déjà frais, sauf force).
 */
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { gate } from "../_shared/gate.ts";
import { getCached, hasOpenAI, logAI, openai, setCached, sha256Hex } from "../_shared/aiClient.ts";
import { categoryToAxis } from "../personal-insights/relevance.ts";
import {
  clampContribution,
  collectGoals,
  computeCoverage,
  type CoverageItem,
  type GoalInput,
  GOALS_COVERAGE_VERSION,
  goalsSignature,
  isDeterministicGoal,
  pairNeedsAI,
  type ProductInput,
  resolveProductAxis,
  routineSignature,
  type SkinProfileGoals,
  starsFromScore,
} from "./core.ts";

const V = GOALS_COVERAGE_VERSION;
const MAX_PRODUCTS = 30; // bornage coût/temps ; routines réelles bien plus petites
const CONCURRENCY = 6;
const AI_TIMEOUT_MS = 22_000;
// Garde-fou temps : passé ce délai on cesse de lancer de NOUVEAUX jugements IA
// (on dégrade au cache / 0) pour TOUJOURS répondre sous la limite de la fonction.
const DEADLINE_MS = 55_000;

// Produits SANS catégorie catalogue (axis unknown) dont le NOM dit clairement
// qu'ils ne concernent pas les soins peau/cheveux (règle user : « un déo ne
// concerne pas l'hydratation »). Regex étroite (PAS « parfum » seul → éviterait
// à tort une crème « parfumée »).
const NAME_NONE_RE =
  /(d[ée]odorant|deodorant|anti[- ]?transpirant|antiperspirant|dentifrice|toothpaste|zahnpasta|bain de bouche|mouthwash|eau de (parfum|toilette))/i;

type Rating = { c: number };
type RatingMap = Record<string, Rating>;

type StoredItem = {
  name?: string | null;
  input?: string | null;
  slug?: string | null;
  colorRating?: string | null;
  primaryFunction?: string | null;
};

type ProductRow = {
  id: string;
  name: string;
  brand: string | null;
  score: number | null;
  ean: string | null;
  axis: ProductInput["axis"];
  stars: number;
  frequency: ProductInput["frequency"];
  categoryLabel: string;
  resultJson: unknown;
  key?: string;
};

// ── Helpers profil / routine ─────────────────────────────────────────────────

function readGoals(prefs: unknown): SkinProfileGoals {
  if (!prefs || typeof prefs !== "object") return {};
  const skin = (prefs as { skin?: unknown }).skin;
  if (!skin || typeof skin !== "object") return {};
  const s = skin as Record<string, unknown>;
  const str = (k: string) => (typeof s[k] === "string" ? (s[k] as string) : undefined);
  return {
    goals: Array.isArray(s.goals) ? (s.goals.filter((x) => typeof x === "string") as string[]) : undefined,
    otherGoals: str("otherGoals"),
    otherGoalsFace: str("otherGoalsFace"),
    otherGoalsBody: str("otherGoalsBody"),
    otherGoalsHair: str("otherGoalsHair"),
    otherGoalsRoutine: str("otherGoalsRoutine"),
  };
}

function extractItems(rj: unknown): StoredItem[] {
  if (!rj || typeof rj !== "object") return [];
  const items = (rj as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];
  const out: StoredItem[] = [];
  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    const r = it as Record<string, unknown>;
    const nm = typeof r.name === "string" && r.name.trim()
      ? r.name.trim()
      : typeof r.input === "string"
      ? r.input.trim()
      : "";
    if (!nm) continue;
    out.push({
      name: nm.slice(0, 60),
      slug: typeof r.slug === "string" ? r.slug : null,
      colorRating: typeof r.colorRating === "string" ? r.colorRating : null,
      primaryFunction: typeof r.primaryFunction === "string" ? r.primaryFunction : null,
    });
  }
  return out;
}

// deno-lint-ignore no-explicit-any
function normalizeProduct(row: any): ProductRow | null {
  const a = Array.isArray(row?.analyses) ? row.analyses[0] : row?.analyses;
  if (!a || typeof a !== "object" || typeof a.id !== "string") return null;
  const category = typeof a.category === "string" ? a.category : null;
  const categoryPrecise = typeof a.category_precise === "string" ? a.category_precise : null;
  const score = typeof a.score === "number" ? a.score : null;
  const freq = row.frequency === "weekly" ? "weekly" : row.frequency === "monthly" ? "monthly" : "daily";
  const label = (typeof a.product_label === "string" && a.product_label.trim())
    || (typeof a.name === "string" && a.name.trim())
    || "Produit";
  let axis = resolveProductAxis(categoryToAxis, categoryPrecise, category);
  // Filet nom : un déo/dentifrice/parfum sans catégorie (axis unknown) ne doit
  // pas être jugé pour les objectifs peau/cheveux (les objectifs meta/libres
  // l'acceptent toujours via pairNeedsAI, ex. « sentir bon »).
  if (axis === "unknown" && NAME_NONE_RE.test(label)) axis = "none";
  return {
    id: a.id,
    name: label,
    brand: typeof a.brand === "string" ? a.brand : null,
    score,
    ean: typeof a.ean === "string" ? a.ean : null,
    axis,
    stars: starsFromScore(score),
    frequency: freq,
    categoryLabel: categoryPrecise || category || "",
    resultJson: a.result_json ?? null,
  };
}

/** Clé d'identité produit pour le cache cross-user (EAN > hash INCI > id). */
async function buildProductKey(p: ProductRow): Promise<string> {
  const ean = (p.ean ?? "").trim();
  if (ean) return `ean:${ean}`;
  const items = extractItems(p.resultJson);
  const slugs = items.map((i) => i.slug).filter((s): s is string => !!s).sort();
  if (slugs.length) return `inci:${(await sha256Hex(slugs.join(","))).slice(0, 32)}`;
  const names = items.map((i) => (i.name ?? "").toLowerCase()).filter(Boolean).sort();
  if (names.length) return `inci:${(await sha256Hex(names.join(","))).slice(0, 32)}`;
  return `analysis:${p.id}`;
}

function buildProductBlock(p: ProductRow): string {
  const items = extractItems(p.resultJson);
  const top = items
    .slice(0, 18)
    .map((i) => `${i.name}${i.colorRating ? ` [${i.colorRating}]` : ""}${i.primaryFunction ? ` (${i.primaryFunction})` : ""}`)
    .join(", ");
  return [
    `PRODUIT : ${p.name}${p.brand ? ` — ${p.brand}` : ""}`,
    `Catégorie : ${p.categoryLabel || "inconnue"}`,
    `Qualité : ${p.stars}/5 (note ${p.score ?? "?"} /20)`,
    `Ingrédients clés : ${top || "non disponibles"}`,
  ].join("\n");
}

// ── JSON parsing robuste ─────────────────────────────────────────────────────

function parseJson<T>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  let t = raw.trim();
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  if (a >= 0 && b > a) t = t.slice(a, b + 1);
  try {
    return JSON.parse(t) as T;
  } catch {
    return null;
  }
}

function parseRatings(raw: string | null, keys: string[]): RatingMap {
  const p = parseJson<{ ratings?: Record<string, { c?: unknown }> }>(raw);
  const r = p?.ratings ?? {};
  const out: RatingMap = {};
  for (const k of keys) {
    const c = r?.[k]?.c;
    if (typeof c === "number") out[k] = { c: clampContribution(c) };
  }
  return out;
}

// ── Appels IA (GPT-5 / GPT-5-mini) ───────────────────────────────────────────

async function callJson(model: string, system: string, user: string): Promise<string | null> {
  // gpt-5* : pas de temperature/max_tokens (non supportés), reasoning_effort bas.
  // deno-lint-ignore no-explicit-any
  const args: any = {
    model,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };
  if (model.startsWith("gpt-5")) args.reasoning_effort = "low";
  else {
    args.temperature = 0.2;
    args.max_tokens = 900;
  }
  const r = await openai().chat.completions.create(args, { timeout: AI_TIMEOUT_MS, maxRetries: 1 });
  return r.choices?.[0]?.message?.content ?? null;
}

const PROPOSE_SYS =
  `Tu es un expert cosmétique et dermatologie. On te donne UN produit (catégorie, qualité, ingrédients clés avec fonction) et une liste d'OBJECTIFS beauté d'un utilisateur.\n` +
  `Pour CHAQUE objectif, note de 0 à 3 dans quelle mesure CE produit aide RÉELLEMENT à l'atteindre, uniquement d'après sa composition et sa fonction :\n` +
  `0 = aucun rapport / n'y contribue pas\n1 = contribue un peu (effet secondaire)\n2 = contribue bien\n3 = contribue fortement (un de ses buts principaux)\n` +
  `RÈGLES STRICTES : si le produit n'a rien à voir avec l'objectif, mets 0 ; ne gonfle jamais une note ; base-toi sur les ingrédients ACTIFS présents, pas sur le marketing.\n` +
  `Réponds en JSON STRICT avec EXACTEMENT les clés fournies : {"ratings":{"<cle_objectif>":{"c":0}}}`;

const REVIEW_SYS =
  `Tu es un expert cosmétique SÉVÈRE. On te montre un produit, des objectifs, et des notes 0-3 proposées par un premier modèle. RELIS et CORRIGE celles qui sont fausses (trop généreuses OU trop sévères) selon la composition réelle :\n` +
  `- un déodorant, un parfum ou un accessoire n'hydrate pas et ne traite pas la peau du visage → 0 ;\n` +
  `- un dentifrice PEUT servir un objectif « belle dentition / dents saines » → note élevée si pertinent ;\n` +
  `- « mieux protéger du soleil » exige un filtre UV / SPF, sinon 0 ;\n` +
  `- ne récompense un objectif que si un ingrédient ACTIF ou la fonction du produit le justifie.\n` +
  `Renvoie le MÊME format JSON COMPLET (toutes les clés) avec les notes corrigées : {"ratings":{"<cle>":{"c":0}}}`;

const ADJUDICATE_SYS =
  `Deux modèles ont donné des notes différentes (0-3) sur la contribution d'un produit à certains objectifs. Pour chaque désaccord, donne la note FINALE la plus juste selon la composition réelle du produit. Réponds en JSON strict {"ratings":{"<cle>":{"c":0}}} avec uniquement les clés listées.`;

/** 2-3 passes : gpt-5-mini propose → gpt-5 révise → gpt-5-mini adjuge les désaccords. */
async function judge(productBlock: string, goals: GoalInput[], userId: string): Promise<RatingMap> {
  const keys = goals.map((g) => g.key);
  const goalsList = goals.map((g) => `- ${g.key} => "${g.label}"`).join("\n");
  const t0 = Date.now();

  let map1: RatingMap = {};
  try {
    map1 = parseRatings(await callJson("gpt-5-mini", PROPOSE_SYS, `${productBlock}\n\nOBJECTIFS (clé => intitulé) :\n${goalsList}`), keys);
  } catch { /* dégrade */ }

  // Relecture gpt-5-mini (rapide) : un 2ᵉ passage critique corrige les erreurs.
  // gpt-5 (full, plus lent) est réservé à l'ADJUDICATION des désaccords ci-dessous
  // → coût/temps maîtrisés même sur une grosse routine, gpt-5 en arbitre.
  let map2: RatingMap = {};
  try {
    const cur = keys.map((k) => `- ${k}: ${map1[k]?.c ?? 0}`).join("\n");
    map2 = parseRatings(
      await callJson("gpt-5-mini", REVIEW_SYS, `${productBlock}\n\nOBJECTIFS (clé => intitulé) :\n${goalsList}\n\nNOTES ACTUELLES :\n${cur}`),
      keys,
    );
  } catch { /* dégrade */ }

  const merged: RatingMap = {};
  for (const k of keys) merged[k] = map2[k] ?? map1[k] ?? { c: 0 };

  const disputed = keys.filter((k) => Math.abs((map1[k]?.c ?? 0) - (map2[k]?.c ?? 0)) >= 2);
  if (disputed.length > 0) {
    try {
      const dl = disputed
        .map((k) => {
          const g = goals.find((x) => x.key === k);
          return `- ${k} ("${g?.label ?? k}") : modèle A=${map1[k]?.c ?? 0}, modèle B=${map2[k]?.c ?? 0}`;
        })
        .join("\n");
      const m3 = parseRatings(
        await callJson("gpt-5-mini", ADJUDICATE_SYS, `${productBlock}\n\nDÉSACCORDS (donne la note finale) :\n${dl}`),
        disputed,
      );
      for (const k of disputed) if (m3[k]) merged[k] = m3[k];
    } catch { /* garde merged */ }
  }

  logAI({ feature: "goals_coverage", provider: "openai", status: "success", model: "gpt-5-mini", duration_ms: Date.now() - t0, user_id: userId });
  return merged;
}

// ── Pool de concurrence borné ────────────────────────────────────────────────
async function runPool<T>(items: T[], limit: number, fn: (t: T) => Promise<void>): Promise<void> {
  let i = 0;
  const n = Math.min(limit, items.length);
  const workers = Array.from({ length: n }, async () => {
    while (i < items.length) {
      const idx = i++;
      try {
        await fn(items[idx]);
      } catch {
        // dégrade : ce produit contribuera 0 aux objectifs non résolus
      }
    }
  });
  await Promise.all(workers);
}

// ── Handler ──────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request): Promise<Response> => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") return jsonResponse({ error: "Méthode non autorisée." }, { status: 405 });

  const g = await gate(req, { feature: "goals_coverage", costCredits: 0, rateMax: 15 });
  if (!g.ok) return g.response;
  const { user, supabase, consumeCredit } = g;

  let body: { force?: boolean } = {};
  try {
    body = (await req.json()) as { force?: boolean };
  } catch {
    body = {};
  }
  const force = body?.force === true;

  const db = supabase.schema("cosme_check");

  // 1. Objectifs du profil
  const { data: profileRow } = await db.from("user_profiles").select("preferences").eq("id", user.id).maybeSingle();
  const goals = collectGoals(readGoals(profileRow?.preferences));
  if (goals.length === 0) return jsonResponse({ state: "no_goals" });
  const gSig = goalsSignature(goals);

  // 2. Routine (RLS = user)
  const { data: routineRows } = await db
    .from("routine_items")
    .select("analysis_id, frequency, analyses(id, product_label, name, brand, score, category, category_precise, ean, result_json)")
    .eq("user_id", user.id);
  // deno-lint-ignore no-explicit-any
  const rows = (routineRows ?? []) as any[];
  const sigItems = rows
    .filter((r) => r?.analysis_id)
    .map((r) => ({ analysis_id: String(r.analysis_id), frequency: String(r.frequency ?? "daily") }));
  const rSig = routineSignature(sigItems);
  const products = rows.map(normalizeProduct).filter((p): p is ProductRow => p !== null);
  if (products.length === 0) return jsonResponse({ state: "empty_routine", routineSignature: rSig, goalsSignature: gSig });

  // 3. Court-circuit GRATUIT : résultat déjà frais (mêmes signatures + version).
  const { data: existing } = await db
    .from("routine_goal_coverage")
    .select("coverage, routine_signature, goals_signature, model_version")
    .eq("user_id", user.id)
    .maybeSingle();
  if (
    !force && existing && existing.model_version === V &&
    existing.routine_signature === rSig && existing.goals_signature === gSig
  ) {
    return jsonResponse({
      state: "ok",
      coverage: existing.coverage,
      routineSignature: rSig,
      goalsSignature: gSig,
      productCount: products.length,
      cached: true,
      credits: g.credits,
    });
  }

  if (!hasOpenAI()) return jsonResponse({ error: "Génération momentanément indisponible." }, { status: 503 });

  // 4. VÉRIFIE le solde SANS débiter (règle user : on ne débite qu'APRÈS un
  // résultat ; jamais sur erreur). Le débit atomique a lieu APRÈS succès (§8).
  const COST = 3;
  const { data: balRaw } = await supabase.rpc("cosme_check_get_credits");
  const bal = (balRaw ?? {}) as { remaining?: number; used?: number; limit?: number };
  const remainingNow = typeof bal.remaining === "number" ? bal.remaining : 0;
  if (remainingNow < COST) {
    return jsonResponse(
      {
        error: "Tu as utilisé tous tes crédits du jour.",
        code: "no_credits",
        credits: { used: bal.used ?? 0, limit: bal.limit ?? 0, remaining: remainingNow },
      },
      { status: 429, headers: { "X-Credits-Remaining": String(remainingNow) } },
    );
  }

  const capped = products.slice(0, MAX_PRODUCTS);
  let coverage: CoverageItem[];
  try {
    const startedAt = Date.now();
    // 5. Jugement IA par produit (cache cross-user ai_cache), concurrence bornée.
    const contrib = new Map<string, number>();
    await runPool(capped, CONCURRENCY, async (p) => {
      p.key = await buildProductKey(p);
      // L'objectif méta decouvrir_clean est calculé en déterministe
      // (computeCoverage) → jamais soumis à l'IA.
      const candidates = goals.filter((go) => !isDeterministicGoal(go.key) && pairNeedsAI(p.axis, go.axis));
      if (candidates.length === 0) return;
      const cacheKey = `goal-affinity:v${V}:${p.key}`;
      const cached = (await getCached<RatingMap>(cacheKey)) ?? {};
      const predef = candidates.filter((go) => !go.isCustom);
      const custom = candidates.filter((go) => go.isCustom);
      const missingPredef = predef.filter((go) => !(go.key in cached));
      const toJudge = [...missingPredef, ...custom];
      let judged: RatingMap = cached;
      // Garde-fou temps : passé le budget on ne lance plus de jugement (cache/0)
      // → la fonction répond toujours sous la limite, même sur une grosse routine.
      if (toJudge.length > 0 && Date.now() - startedAt < DEADLINE_MS) {
        const fresh = await judge(buildProductBlock(p), toJudge, user.id);
        judged = { ...cached, ...fresh };
        // On ne PERSISTE que les objectifs PRÉDÉFINIS (bornage du cache cross-user ;
        // les objectifs libres sont propres à un user → recalculés à chaque fois).
        const toStore: RatingMap = { ...cached };
        for (const go of predef) if (fresh[go.key]) toStore[go.key] = fresh[go.key];
        await setCached(cacheKey, toStore);
      }
      for (const go of candidates) contrib.set(`${p.key}|${go.key}`, judged[go.key]?.c ?? 0);
    });

    // 6. Agrégation DÉTERMINISTE.
    const productInputs: ProductInput[] = capped.map((p) => ({
      key: p.key ?? `analysis:${p.id}`,
      axis: p.axis,
      stars: p.stars,
      frequency: p.frequency,
    }));
    coverage = computeCoverage(productInputs, goals, (pk, gk) => contrib.get(`${pk}|${gk}`) ?? 0);
  } catch (_e) {
    // Échec pendant le calcul (timeout IA, panne fournisseur) → AUCUN débit : on
    // n'a pas encore débité. Erreur DOUCE « réessaie », le solde reste intact.
    return jsonResponse(
      { error: "Génération momentanément indisponible. Réessaie dans un instant.", code: "transient" },
      { status: 503 },
    );
  }

  // 8. Débit APRÈS succès (atomique). Course concurrente qui épuiserait le solde
  // entre le pré-check et ici (rare) → on renvoie quand même le résultat calculé.
  let credits = {
    used: (bal.used ?? 0) + COST,
    limit: bal.limit ?? 0,
    remaining: Math.max(0, remainingNow - COST),
  };
  const charge = await consumeCredit("goals_coverage", COST);
  if (charge.ok) credits = charge.credits;

  // 7. Persistance best-effort (un échec d'écriture ne doit PAS perdre le résultat
  // ni les crédits : on renvoie quand même la couverture calculée).
  try {
    await db.from("routine_goal_coverage").upsert(
      {
        user_id: user.id,
        coverage,
        routine_signature: rSig,
        goals_signature: gSig,
        model_version: V,
        product_count: products.length,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
  } catch { /* ignore : la couverture est renvoyée, le reload la recalculera */ }

  return jsonResponse({
    state: "ok",
    coverage,
    routineSignature: rSig,
    goalsSignature: gSig,
    productCount: products.length,
    cached: false,
    credits,
  });
});
