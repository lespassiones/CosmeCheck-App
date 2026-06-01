/**
 * Edge Function `analyser` — port du pipeline d'analyse INCI web
 * (`CosmetWiki/app/api/analyser/route.ts`) vers Supabase Edge (Deno).
 *
 * Pipeline (ordre IDENTIQUE au web) :
 *   1. Auth Bearer + rate-limit IP (gate, costCredits:0 — pas de débit ici).
 *   2. Idempotence (hash {user, route, body}) → réponse cachée si rejouée.
 *   3. Cache EAN `product_analyses` → court-circuit SANS débit de crédit.
 *   4. Débit de 1 crédit (consumeCredit) APRÈS les court-circuits.
 *   5. Fast-path déterministe `isCleanInciInput` : parse local + match DB +
 *      score, SANS aucun appel LLM. Sinon cascade IA (parse/validate/split),
 *      qui dégrade gracieusement si les clés IA manquent.
 *   6. Match DB (cosme_check_match_inci_batch) + correction typo IA (trigram +
 *      LLM), dédup, comptes, score, tags, observations, allergènes UE,
 *      seuils, spectre, catégorie LLM, synthèse LLM optionnelle.
 *   7. Persiste dans cosme_check.analyses (client lié au user → RLS) ;
 *      routine_items si addToRoutine ; cache EAN + catalog en service-role.
 *
 * Sortie : AnalyseResponse + { analysisId, addedToRoutine } (match web).
 */
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { gate } from "../_shared/gate.ts";
import { serviceClient } from "../_shared/auth.ts";
import { sha256Hex } from "../_shared/aiClient.ts";
import { type ColorRating, computeScore, type ScoreTone, scoreLabel } from "./score.ts";
import { isCleanInciInput, parseInciList } from "./parse.ts";
import {
  EU_ALLERGENS_TOTAL,
  getEuFragranceAllergen,
  isEuFragranceAllergen,
} from "./euAllergens.ts";
import {
  NEUTRAL_OR_POSITIVE_TAGS,
  normalizeProductTypeToCategory,
  type ProductCategory,
} from "./engine.ts";
import {
  categorizeProduct,
  correctTypo,
  generateSynthesis,
  parseInciWithAI,
  splitInciWithGpt,
  validateInciInput,
} from "./ai.ts";

type MatchRow = {
  input_token: string;
  position_idx: number;
  inci_id: number | null;
  slug: string | null;
  name: string | null;
  color_rating: ColorRating | null;
  cas_number: string | null;
  translation_fr: string | null;
  primary_function: string | null;
  all_functions: string[] | null;
  tags: string[] | null;
  match_kind: "exact" | "alias" | "fuzzy_high" | "suggestion" | null;
  confidence: number | string | null;
};

type ThresholdContext =
  | "before_fragrance" | "after_fragrance"
  | "before_preservative" | "after_preservative" | null;

type AnalysePayload = {
  text?: string;
  hp?: string;
  withSynthesis?: boolean;
  productLabel?: string;
  brand?: string;
  productType?: string;
  addToRoutine?: boolean;
  productEan?: string;
};

const TAG_LABELS: Record<string, string> = {
  paraben: "Parabens",
  silicone: "Silicones",
  sulfate: "Sulfates",
  "huile-minerale": "Huiles minérales",
  ethoxyle: "Composés éthoxylés",
  propoxyle: "Composés propoxylés",
  "colorant-synthese": "Colorants de synthèse",
  "ammonium-quaternaire": "Ammoniums quaternaires",
  "allergene-parfumant": "Allergènes parfum",
  "allergene-reglemente": "Allergènes réglementés",
  conservateur: "Conservateurs",
  "parfum-synthese": "Parfums de synthèse",
  "huile-essentielle": "Huiles essentielles",
  "filtre-uv": "Filtres UV",
  cmr: "CMR",
  ogm: "OGM",
};

const ABSENCE_REPORTED = new Set([
  "paraben", "sulfate", "huile-minerale", "silicone", "allergene-parfumant",
  "allergene-reglemente", "ethoxyle", "propoxyle", "colorant-synthese",
  "ammonium-quaternaire", "parfum-synthese", "filtre-uv", "cmr",
  "conservateur", "ogm",
]);
const NEUTRAL_WHEN_ABSENT = new Set(["huile-essentielle"]);
ABSENCE_REPORTED.add("huile-essentielle");

const WATER_NAMES = new Set(["aqua", "water", "eau"]);
const TOP_LIST_WINDOW = 5;
const DIACRITICS_RE = new RegExp("[\\u0300-\\u036f]", "g");
const FRAGRANCE_NAMES = new Set(["PARFUM", "FRAGRANCE", "AROMA", "FLAVOR"]);

type Observation = {
  tag: string;
  label: string;
  status: "present" | "absent" | "info" | "warn";
  count: number;
  items: { name: string; slug: string | null; colorRating: ColorRating | null }[];
  message?: string;
};

/** Recompute thresholdContext sur des items déjà stockés (cache EAN ETL). */
type ThresholdItem = {
  name: string | null;
  tags?: string[] | null;
  thresholdContext?: ThresholdContext;
  thresholdLabel?: string | null;
  [key: string]: unknown;
};
function recomputeThresholdContext(items: ThresholdItem[]): ThresholdItem[] {
  const firstFragranceIdx = items.findIndex(
    (it) =>
      (it.name && FRAGRANCE_NAMES.has(it.name.toUpperCase())) ||
      (it.tags?.includes("parfum-synthese") ?? false),
  );
  const firstPreservativeIdx = items.findIndex((it) => it.tags?.includes("conservateur") ?? false);
  let referenceIdx: number;
  let kind: "fragrance" | "preservative" | null;
  if (firstFragranceIdx >= 0) { referenceIdx = firstFragranceIdx; kind = "fragrance"; }
  else if (firstPreservativeIdx >= 0) { referenceIdx = firstPreservativeIdx; kind = "preservative"; }
  else { referenceIdx = -1; kind = null; }

  return items.map((it, idx) => {
    if (referenceIdx < 0 || !kind || idx === referenceIdx) {
      return { ...it, thresholdContext: null, thresholdLabel: null };
    }
    const before = idx < referenceIdx;
    if (kind === "fragrance") {
      return { ...it, thresholdContext: before ? "before_fragrance" : "after_fragrance", thresholdLabel: before ? "avant parfum" : "après parfum" };
    }
    return { ...it, thresholdContext: before ? "before_preservative" : "after_preservative", thresholdLabel: before ? "avant conservateur" : "après conservateur" };
  });
}

// ─── Idempotence (port de CosmetWiki/lib/idempotency.ts, Deno) ──────────────
const IDEM_TTL_MS = 24 * 60 * 60 * 1000;
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}
async function idempotencyKey(userId: string, route: string, body: unknown): Promise<string> {
  const hash = (await sha256Hex(stableStringify(body))).slice(0, 24);
  return `${route}:${userId}:${hash}`;
}
async function idempotencyLookup(key: string): Promise<unknown | null> {
  try {
    const svc = serviceClient();
    const { data } = await svc
      .schema("cosme_check")
      .from("idempotency")
      .select("response, status_code, created_at")
      .eq("key", key)
      .maybeSingle();
    if (!data) return null;
    const age = Date.now() - new Date(data.created_at as string).getTime();
    if (age > IDEM_TTL_MS) return null;
    return data.response;
  } catch {
    return null;
  }
}
async function idempotencyStore(key: string, body: unknown): Promise<void> {
  try {
    const svc = serviceClient();
    await svc
      .schema("cosme_check")
      .from("idempotency")
      .upsert(
        { key, response: body, status_code: 200, created_at: new Date().toISOString() },
        { onConflict: "key" },
      );
  } catch {
    // best-effort
  }
}

Deno.serve(async (req: Request) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Méthode non autorisée." }, { status: 405 });
  }

  let body: AnalysePayload;
  try {
    body = (await req.json()) as AnalysePayload;
  } catch {
    return jsonResponse({ error: "Requête invalide." }, { status: 400 });
  }

  // Honey-pot anti-bot.
  if (body.hp && body.hp.length > 0) {
    return jsonResponse({ error: "Forbidden" }, { status: 403 });
  }

  const rawText = (body.text ?? "").slice(0, 8000);
  if (!rawText.trim()) {
    return jsonResponse({ error: "Liste vide." }, { status: 400 });
  }

  // ── 1. Auth + rate-limit IP, SANS débit de crédit (mirror web) ──────────
  const g = await gate(req, { feature: "analyser", costCredits: 0 });
  if (!g.ok) return g.response;
  const { user, supabase: sbAuth } = g;

  // ── 2. Idempotence ──────────────────────────────────────────────────────
  const idemKey = await idempotencyKey(user.id, "analyser", {
    text: rawText,
    productLabel: body.productLabel ?? null,
    brand: body.brand ?? null,
    productType: body.productType ?? null,
    withSynthesis: body.withSynthesis !== false,
    addToRoutine: body.addToRoutine === true,
  });
  const cached = await idempotencyLookup(idemKey);
  if (cached) {
    return jsonResponse(cached, { headers: { "X-Idempotent-Replay": "1" } });
  }

  // ── 3. Cache EAN pré-calculé (SANS débit de crédit) ─────────────────────
  const productEan = body.productEan?.trim() || null;
  if (productEan) {
    try {
      const svc = serviceClient();
      const { data: precomputed } = await svc.rpc("cosme_check_get_product_analysis", { p_ean: productEan });
      if (precomputed) {
        const cachedResult = precomputed as Record<string, unknown>;
        const items = (Array.isArray(cachedResult.items) ? cachedResult.items : []) as ThresholdItem[];
        cachedResult.items = recomputeThresholdContext(items);
        cachedResult.synthesis = null;

        let savedAnalysisId: string | null = null;
        try {
          const autoName = body.productLabel?.slice(0, 200)
            ?? `Analyse du ${new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}`;
          const { data: inserted } = await sbAuth
            .schema("cosme_check")
            .from("analyses")
            .insert({
              user_id: user.id,
              name: autoName,
              product_label: body.productLabel?.slice(0, 200) ?? null,
              brand: body.brand?.slice(0, 120) ?? null,
              product_type: body.productType?.slice(0, 120) ?? null,
              category: (cachedResult.category as string | null) ?? null,
              input_text: rawText,
              result_json: cachedResult,
              score: Number(((cachedResult.score as number) ?? 0).toFixed(2)),
            })
            .select("id")
            .single();
          savedAnalysisId = (inserted?.id as string) ?? null;
        } catch { /* l'échec d'historique ne bloque pas la réponse */ }

        return jsonResponse({ ...cachedResult, analysisId: savedAnalysisId, addedToRoutine: false });
      }
    } catch { /* cache miss → pipeline complet */ }
  }

  // ── 4. Débit du crédit (APRÈS les court-circuits) ───────────────────────
  const charge = await g.consumeCredit("analyser");
  if (!charge.ok) return charge.response;

  // ── 5. Fast-path déterministe vs cascade IA ─────────────────────────────
  const skipAiParse = isCleanInciInput(rawText);

  let text: string;
  if (skipAiParse) {
    text = rawText;
  } else {
    const aiParsed = await parseInciWithAI(rawText, user.id);
    text = aiParsed && aiParsed.ingredients.length > 0 ? aiParsed.ingredients.join(", ") : rawText;
    const validation = await validateInciInput(text, user.id);
    if (!validation.valid) {
      return jsonResponse(
        { error: validation.reason ?? "Ceci ne ressemble pas à une liste INCI." },
        { status: 400 },
      );
    }
  }

  let tokens = parseInciList(text);

  // Rescue split (non-clean uniquement).
  if (!skipAiParse && tokens.length < 3 && text.length > 60) {
    const split = await splitInciWithGpt(text);
    if (split) {
      const rescued = parseInciList(split);
      if (rescued.length > tokens.length) tokens = rescued;
    }
  }

  if (tokens.length === 0) {
    return jsonResponse({ error: "Aucun ingrédient détecté dans la liste." }, { status: 400 });
  }

  // ── 6. Match DB ─────────────────────────────────────────────────────────
  const svc = serviceClient();
  const { data: matchData, error: matchError } = await svc.rpc("cosme_check_match_inci_batch", {
    p_tokens: tokens.map((t) => t.normalized),
  });
  if (matchError) {
    return jsonResponse(
      { error: "Erreur lors de l'analyse des ingrédients. Réessaye dans un instant." },
      { status: 500 },
    );
  }
  let rows = (matchData ?? []) as MatchRow[];

  // Correction typo IA (suggestions 0.55..0.90) : trigram → LLM → batch fetch.
  const suggestionRows = rows.filter((r) => r.match_kind === "suggestion");
  if (suggestionRows.length > 0) {
    type CandidateRow = { inci_id: number; name: string; primary_function: string | null; similarity: number };

    const candidateResults = await Promise.all(
      suggestionRows.map(async (row) => {
        const { data } = await svc.rpc("cosme_check_top_trigram_candidates", {
          p_token: tokens[row.position_idx]?.normalized ?? row.input_token,
          p_limit: 5,
        });
        return { row, candidates: (data ?? []) as CandidateRow[] };
      }),
    );

    const decisions = await Promise.all(
      candidateResults
        .filter(({ candidates }) => candidates.length > 0)
        .map(async ({ row, candidates }) => {
          const decision = await correctTypo(
            tokens[row.position_idx]?.normalized ?? row.input_token,
            candidates,
            user.id,
          );
          return { row, decision };
        }),
    );

    const winners = decisions.filter(
      ({ decision }) => decision.matchedInciId !== null && decision.confidence >= 0.85,
    );
    if (winners.length > 0) {
      const winnerIds = winners.map(({ decision }) => decision.matchedInciId as number);
      const { data: ingRows } = await svc
        .schema("cosme_check")
        .from("ingredients")
        .select("inci_id, slug, name, color_rating, cas_number, translations, functions, tags")
        .in("inci_id", winnerIds);

      type IngRow = {
        inci_id: number;
        slug: string;
        name: string;
        color_rating: ColorRating | null;
        cas_number: string | null;
        translations: Record<string, string> | null;
        functions: { name?: string }[] | null;
        tags: string[] | null;
      };
      const ingById = new Map(((ingRows ?? []) as IngRow[]).map((ing) => [ing.inci_id, ing]));

      for (const { row, decision } of winners) {
        const ing = ingById.get(decision.matchedInciId as number);
        if (!ing) continue;
        const idx = rows.findIndex((r) => r.position_idx === row.position_idx);
        if (idx >= 0) {
          rows[idx] = {
            input_token: row.input_token,
            position_idx: row.position_idx,
            inci_id: ing.inci_id,
            slug: ing.slug,
            name: ing.name,
            color_rating: ing.color_rating,
            cas_number: ing.cas_number,
            translation_fr: ing.translations?.fr ?? "",
            primary_function: ing.functions?.[0]?.name ?? "",
            all_functions: ing.functions?.map((f) => f.name ?? "").filter(Boolean) ?? null,
            tags: ing.tags,
            match_kind: "fuzzy_high",
            confidence: decision.confidence,
          };
        }
      }
    }
  }

  // Ré-attache le token brut par position ; suggestions traitées comme non-match.
  const rawEnriched = rows.map((r) => {
    const tok = tokens[r.position_idx];
    const isSuggestion = r.match_kind === "suggestion";
    const confidence = typeof r.confidence === "string" ? Number(r.confidence) : (r.confidence ?? 0);
    return {
      ...r,
      input_raw: tok ? tok.raw : r.input_token,
      effective_color: isSuggestion ? null : r.color_rating,
      effective_inci_id: isSuggestion ? null : r.inci_id,
      effective_name: isSuggestion ? null : r.name,
      effective_tags: isSuggestion ? null : r.tags,
      effective_all_functions: isSuggestion ? null : r.all_functions,
      suggested_name: isSuggestion ? r.name : null,
      db_color_rating: r.color_rating,
      confidence,
    };
  });

  // Alias FR/EN avant dédup.
  const aliasesUsed = rawEnriched
    .filter((r) => r.match_kind === "alias")
    .map((r) => ({ from: r.input_raw, to: r.name }));

  // Dédup par inci_id canonique (garde la 1re position), renumérote.
  const seenInciIds = new Set<string | number>();
  const enriched = rawEnriched
    .slice()
    .sort((a, b) => a.position_idx - b.position_idx)
    .filter((r) => {
      if (!r.effective_inci_id) return true;
      if (seenInciIds.has(r.effective_inci_id)) return false;
      seenInciIds.add(r.effective_inci_id);
      return true;
    })
    .map((r, i) => ({ ...r, position_idx: i }));

  // Comptes.
  const counts: Record<string, number> = { Vert: 0, Jaune: 0, Orange: 0, Rouge: 0, "Non reconnu": 0 };
  for (const r of enriched) {
    if (r.effective_color) counts[r.effective_color]++;
    else counts["Non reconnu"]++;
  }
  const matched = enriched.length - counts["Non reconnu"];

  // Score.
  const score = computeScore(
    enriched.map((r) => ({ color_rating: r.effective_color, position: r.position_idx })),
    enriched.length,
  );
  const { label: scoreLabelText, tone: scoreTone } = scoreLabel(score);

  // Agrégation de tags.
  const tagCounts: Record<string, number> = {};
  const tagItems: Record<string, { name: string; slug: string | null; colorRating: ColorRating | null }[]> = {};
  for (const r of enriched) {
    if (!r.effective_tags) continue;
    for (const t of r.effective_tags) {
      tagCounts[t] = (tagCounts[t] || 0) + 1;
      if (!tagItems[t]) tagItems[t] = [];
      tagItems[t].push({ name: r.effective_name ?? r.input_raw, slug: r.slug, colorRating: r.effective_color });
    }
  }

  const observations: Observation[] = [];
  for (const tag of ABSENCE_REPORTED) {
    const c = tagCounts[tag] || 0;
    if (c === 0) {
      const status: "absent" | "info" = NEUTRAL_WHEN_ABSENT.has(tag) ? "info" : "absent";
      observations.push({ tag, label: TAG_LABELS[tag] ?? tag, status, count: 0, items: [] });
    } else {
      observations.push({ tag, label: TAG_LABELS[tag] ?? tag, status: "present", count: c, items: tagItems[tag] ?? [] });
    }
  }
  for (const [tag, c] of Object.entries(tagCounts)) {
    if (ABSENCE_REPORTED.has(tag)) continue;
    if (NEUTRAL_OR_POSITIVE_TAGS.has(tag)) continue;
    if (c > 0) {
      observations.push({ tag, label: TAG_LABELS[tag] ?? tag, status: "present", count: c, items: tagItems[tag] ?? [] });
    }
  }

  const byPosition = [...enriched].sort((a, b) => a.position_idx - b.position_idx);

  // Catégorisation LLM (parallèle, dégrade en "autre").
  const categoryTop5Names = byPosition
    .slice(0, 5)
    .map((r) => r.effective_name ?? r.input_raw)
    .filter((n): n is string => Boolean(n));
  const categoryPromise: Promise<ProductCategory> = categoryTop5Names.length > 0
    ? categorizeProduct(categoryTop5Names, user.id).catch(() => "autre" as ProductCategory)
    : Promise.resolve("autre" as ProductCategory);

  // 1. Formule à base d'eau.
  const first = byPosition[0];
  if (first) {
    const firstNorm = (first.name ?? first.input_raw ?? "")
      .toLowerCase().normalize("NFD").replace(DIACRITICS_RE, "").trim();
    if (WATER_NAMES.has(firstNorm)) {
      const display = (first.name ?? first.input_raw ?? "Aqua").trim();
      const displayCased = display.charAt(0).toUpperCase() + display.slice(1).toLowerCase();
      observations.push({
        tag: "water-based", label: "Formule à base d'eau", status: "info", count: 0, items: [],
        message: `${displayCased} en première position`,
      });
    }
  }

  // 2. Couverture.
  if (enriched.length > 0) {
    const pct = Math.round((matched / enriched.length) * 100);
    observations.push({
      tag: "coverage", label: "Couverture", status: "info", count: matched, items: [],
      message: `${matched}/${enriched.length} ingrédients reconnus (${pct}%)`,
    });
  }

  // 3. Pénalités en début de liste.
  const topProblematic = byPosition
    .slice(0, TOP_LIST_WINDOW)
    .filter((r) => r.effective_color === "Orange" || r.effective_color === "Rouge");
  if (topProblematic.length > 0) {
    observations.push({
      tag: "top-list-warning", label: "Ingrédients de pénalité en début de liste", status: "warn",
      count: topProblematic.length,
      items: topProblematic.map((r) => ({ name: r.effective_name ?? r.input_raw, slug: r.slug, colorRating: r.effective_color })),
      message: `${topProblematic.length} dans le top ${TOP_LIST_WINDOW} (concentration plus élevée)`,
    });
  }

  // Suggestions.
  const suggestions = enriched
    .filter((r) => r.match_kind === "suggestion" && r.suggested_name)
    .map((r) => ({
      position: r.position_idx + 1,
      input: r.input_raw,
      suggestedName: r.suggested_name as string,
      confidence: Number(r.confidence.toFixed(3)),
    }));

  // Seuils fragrance/conservateur.
  const firstFragranceIdx = byPosition.findIndex(
    (r) =>
      (r.effective_name && FRAGRANCE_NAMES.has(r.effective_name.toUpperCase())) ||
      (r.effective_tags?.includes("parfum-synthese") ?? false),
  );
  const firstPreservativeIdx = byPosition.findIndex((r) => r.effective_tags?.includes("conservateur") ?? false);
  let earliestThresholdIdx: number;
  let thresholdKind: "fragrance" | "preservative" | null;
  if (firstFragranceIdx >= 0) { earliestThresholdIdx = firstFragranceIdx; thresholdKind = "fragrance"; }
  else if (firstPreservativeIdx >= 0) { earliestThresholdIdx = firstPreservativeIdx; thresholdKind = "preservative"; }
  else { earliestThresholdIdx = -1; thresholdKind = null; }

  function thresholdFor(positionIdx: number): { context: ThresholdContext; label: string | null } {
    if (earliestThresholdIdx < 0 || !thresholdKind) return { context: null, label: null };
    if (positionIdx === earliestThresholdIdx) return { context: null, label: null };
    const before = positionIdx < earliestThresholdIdx;
    if (thresholdKind === "fragrance") {
      return before
        ? { context: "before_fragrance", label: "avant parfum" }
        : { context: "after_fragrance", label: "après parfum" };
    }
    return before
      ? { context: "before_preservative", label: "avant conservateur" }
      : { context: "after_preservative", label: "après conservateur" };
  }

  // Allergènes parfumants UE.
  const allergensDetected: { inciName: string; label: string; note: string; position: number }[] = [];
  const seenAllergens = new Set<string>();
  for (const r of enriched) {
    const candidates = [r.effective_name, r.input_raw].filter(Boolean) as string[];
    for (const c of candidates) {
      const upper = c.toUpperCase().trim();
      if (seenAllergens.has(upper)) continue;
      if (isEuFragranceAllergen(upper)) {
        const meta = getEuFragranceAllergen(upper)!;
        allergensDetected.push({ inciName: meta.inciName, label: meta.label, note: meta.note, position: r.position_idx + 1 });
        seenAllergens.add(upper);
        break;
      }
    }
  }
  if (allergensDetected.length > 0) {
    observations.push({
      tag: "eu-fragrance-allergens", label: "Allergènes parfumants UE", status: "warn",
      count: allergensDetected.length,
      items: allergensDetected.map((a) => ({ name: a.label, slug: null, colorRating: "Jaune" as ColorRating })),
      message: `${allergensDetected.length} sur ${EU_ALLERGENS_TOTAL} substances réglementées détectées.`,
    });
  }

  // Pénalité atténuée par la position (après parfum).
  if (firstFragranceIdx >= 0) {
    const afterFragrance = byPosition
      .slice(firstFragranceIdx + 1)
      .filter((r) => r.effective_color === "Jaune" || r.effective_color === "Orange" || r.effective_color === "Rouge");
    if (afterFragrance.length > 0) {
      const n = afterFragrance.length;
      observations.push({
        tag: "after-fragrance", label: "Pénalité atténuée par la position", status: "info", count: n,
        items: afterFragrance.map((r) => ({ name: r.effective_name ?? r.input_raw, slug: r.slug, colorRating: r.effective_color })),
        message: `${n} ingrédient${n > 1 ? "s" : ""} sensible${n > 1 ? "s" : ""} apparai${n > 1 ? "ssent" : "t"} après le parfum - concentration ≤ 1 %, impact réel limité.`,
      });
    }
  }

  // Spectre.
  const spectrumTop5: (ColorRating | null)[] = Array.from({ length: 5 }, (_, i) => byPosition[i]?.effective_color ?? null);
  const spectrumTop10: (ColorRating | null)[] = Array.from({ length: 10 }, (_, i) => byPosition[i]?.effective_color ?? null);

  // Synthèse LLM optionnelle (dégrade en null sans clé IA).
  let synthesis: string | null = null;
  if (body.withSynthesis !== false) {
    synthesis = await generateSynthesis({
      enriched: enriched.map((r) => ({
        input_raw: r.input_raw,
        name: r.effective_name,
        color_rating: r.effective_color,
        primary_function: r.primary_function,
        tags: r.effective_tags,
        position_idx: r.position_idx,
        threshold_label: thresholdFor(r.position_idx).label,
      })),
      counts,
      score,
      scoreLabel: scoreLabelText,
      observations: observations.map((o) => ({ label: o.label, status: o.status, count: o.count })),
      productLabel: body.productLabel?.slice(0, 200) ?? null,
      userId: user.id,
    });
  }

  const itemsResponse = enriched.map((r) => {
    const threshold = thresholdFor(r.position_idx);
    return {
      position: r.position_idx + 1,
      input: r.input_raw,
      slug: r.slug,
      name: r.effective_name,
      colorRating: r.effective_color,
      dbColorRating: r.db_color_rating,
      casNumber: r.cas_number,
      translationFr: r.translation_fr,
      primaryFunction: r.primary_function,
      allFunctions: r.effective_all_functions ?? null,
      tags: r.effective_tags,
      matchKind: r.match_kind,
      confidence: Number(r.confidence.toFixed(3)),
      thresholdContext: threshold.context,
      thresholdLabel: threshold.label,
    };
  });

  // Catégorie : course 1.5 s LLM → fallback keyword sur productType.
  const llmCategory: ProductCategory | null = await Promise.race([
    categoryPromise.then((c) => (c && c !== "autre" ? c : null)),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
  ]);
  const resolvedCategory: ProductCategory | null =
    llmCategory ?? normalizeProductTypeToCategory(body.productType) ?? null;

  const responsePayload = {
    counts: {
      total: enriched.length,
      matched,
      vert: counts["Vert"],
      jaune: counts["Jaune"],
      orange: counts["Orange"],
      rouge: counts["Rouge"],
      unknown: counts["Non reconnu"],
    },
    score,
    scoreLabel: scoreLabelText,
    scoreTone: scoreTone as ScoreTone,
    items: itemsResponse,
    observations,
    aliasesUsed,
    suggestions,
    spectrum: { top5: spectrumTop5, top10: spectrumTop10 },
    euFragranceAllergens: { detected: allergensDetected, total: EU_ALLERGENS_TOTAL },
    synthesis,
    productType: body.productType?.slice(0, 120) ?? null,
    category: resolvedCategory,
  };

  // ── 7. Persistance ────────────────────────────────────────────────────────
  let savedAnalysisId: string | null = null;
  let addedToRoutine = false;
  try {
    const autoName = body.productLabel?.slice(0, 200)
      ?? `Analyse du ${new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}`;
    const { data: inserted, error: insertError } = await sbAuth
      .schema("cosme_check")
      .from("analyses")
      .insert({
        user_id: user.id,
        name: autoName,
        product_label: body.productLabel?.slice(0, 200) ?? null,
        brand: body.brand?.slice(0, 120) ?? null,
        product_type: body.productType?.slice(0, 120) ?? null,
        category: resolvedCategory,
        input_text: text,
        result_json: responsePayload,
        score: Number(score.toFixed(2)),
      })
      .select("id")
      .single();
    if (!insertError && inserted?.id) {
      savedAnalysisId = inserted.id as string;
      if (body.addToRoutine === true) {
        const { error: routineErr } = await sbAuth
          .schema("cosme_check")
          .from("routine_items")
          .upsert(
            { user_id: user.id, analysis_id: inserted.id, frequency: "daily" },
            { onConflict: "user_id,analysis_id" },
          );
        if (!routineErr) addedToRoutine = true;
      }
      // Patch catégorie en arrière-plan si le LLM répond après la course 1.5 s.
      const categorizeId = inserted.id as string;
      void categoryPromise
        .then(async (cat) => {
          if (!cat || cat === resolvedCategory) return;
          await sbAuth
            .schema("cosme_check")
            .from("analyses")
            .update({ category: cat })
            .eq("id", categorizeId);
        })
        .catch(() => undefined);
    }
  } catch { /* l'échec d'historique ne bloque jamais la réponse */ }

  // Cache EAN product_analyses (service-role, non-bloquant).
  if (productEan) {
    void (async () => {
      const { upsertProductAnalysis } = await import("./catalog.ts");
      await upsertProductAnalysis({
        ean: productEan,
        resultJson: responsePayload,
        score: Number(score.toFixed(4)),
        scoreLabel: scoreLabelText,
        scoreTone,
        algoVersion: "v1.1",
      });
    })();

    void (async () => {
      const { upsertCatalogProduct } = await import("./catalog.ts");
      await upsertCatalogProduct({
        ean: productEan,
        brand: body.brand ?? null,
        name: body.productLabel ?? null,
        ingredientsText: body.text ?? null,
        score: Number(score.toFixed(4)),
        scoreLabel: scoreLabelText,
        scoreTone,
        countTotal: itemsResponse.length,
      });
    })();
  }

  const finalBody = { ...responsePayload, analysisId: savedAnalysisId, addedToRoutine };
  await idempotencyStore(idemKey, finalBody);
  return jsonResponse(finalBody);
});
