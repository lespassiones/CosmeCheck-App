/**
 * CŒUR D'ASSEMBLAGE de l'analyse INCI — extraction PURE (aucun réseau, aucun
 * Deno API) de la logique historique de `index.ts` (déplacée verbatim le
 * 14 juil 2026, AUCUN changement de comportement).
 *
 * Pourquoi l'extraction : le script de repeuplement `scripts/backfill_product_analyses.ts`
 * doit produire des lignes `product_analyses` STRICTEMENT identiques à ce que
 * l'edge calcule en live (items, couleurs, observations, spectre, allergènes UE,
 * score propriétaire). En important CE module, backfill et live partagent le
 * même code — pas deux implémentations à garder synchronisées.
 *
 * Entrées : tokens du parseur INCI + lignes de match DB (post correction typo).
 * Sorties : tout ce qui compose le result_json (hors synthèse LLM / catégorie
 * LLM / persistance, qui restent dans le handler).
 */
import { type ColorRating, pastilleTone, type ScoreTone, scoreLabel, synthScore } from "./score.ts";
import type { ParsedToken } from "./parse.ts";
import {
  EU_ALLERGENS_TOTAL,
  getEuFragranceAllergen,
  isEuFragranceAllergen,
} from "./euAllergens.ts";
import { NEUTRAL_OR_POSITIVE_TAGS } from "./engine.ts";

export type MatchRow = {
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

export type ThresholdContext =
  | "before_fragrance" | "after_fragrance"
  | "before_preservative" | "after_preservative" | null;

export type Observation = {
  tag: string;
  label: string;
  status: "present" | "absent" | "info" | "warn";
  count: number;
  items: { name: string; slug: string | null; colorRating: ColorRating | null }[];
  message?: string;
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
export const FRAGRANCE_NAMES = new Set(["PARFUM", "FRAGRANCE", "AROMA", "FLAVOR"]);

/** Recompute thresholdContext sur des items déjà stockés (cache EAN ETL). */
export type ThresholdItem = {
  name: string | null;
  tags?: string[] | null;
  thresholdContext?: ThresholdContext;
  thresholdLabel?: string | null;
  [key: string]: unknown;
};
export function recomputeThresholdContext(items: ThresholdItem[]): ThresholdItem[] {
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

export type EnrichedRow = MatchRow & {
  input_raw: string;
  effective_color: ColorRating | null;
  effective_inci_id: number | null;
  effective_name: string | null;
  effective_tags: string[] | null;
  effective_all_functions: string[] | null;
  suggested_name: string | null;
  db_color_rating: ColorRating | null;
  confidence: number;
};

export type ItemResponse = {
  position: number;
  input: string;
  slug: string | null;
  name: string | null;
  colorRating: ColorRating | null;
  dbColorRating: ColorRating | null;
  casNumber: string | null;
  translationFr: string | null;
  primaryFunction: string | null;
  allFunctions: string[] | null;
  tags: string[] | null;
  matchKind: MatchRow["match_kind"];
  confidence: number;
  thresholdContext: ThresholdContext;
  thresholdLabel: string | null;
};

export type CoreAnalysis = {
  enriched: EnrichedRow[];
  /** Comptes bruts par couleur (clé FR, utilisé par la synthèse LLM). */
  counts: Record<string, number>;
  countsPayload: {
    total: number;
    matched: number;
    vert: number;
    jaune: number;
    orange: number;
    rouge: number;
    unknown: number;
  };
  matched: number;
  /** Score PROPRIÉTAIRE recalculé (avant écrasement par le score catalogue). */
  score: number;
  scoreLabelText: string;
  scoreTone: ScoreTone;
  observations: Observation[];
  aliasesUsed: { from: string; to: string | null }[];
  suggestions: { position: number; input: string; suggestedName: string; confidence: number }[];
  spectrum: { top5: (ColorRating | null)[]; top10: (ColorRating | null)[] };
  euFragranceAllergens: {
    detected: { inciName: string; label: string; note: string; position: number }[];
    total: number;
  };
  items: ItemResponse[];
  /** Seuil parfum/conservateur pour une position (utilisé par la synthèse LLM). */
  thresholdFor: (positionIdx: number) => { context: ThresholdContext; label: string | null };
  /** 5 premiers noms (classifieur catégorie LLM, produits hors catalogue). */
  categoryTop5Names: string[];
};

/**
 * Assemble l'analyse complète depuis (tokens, lignes de match). Port VERBATIM
 * de la logique historique d'index.ts — ne pas "améliorer" ici sans mettre à
 * jour le twin web (app/api/analyser/route.ts) et re-valider l'équivalence.
 */
export function buildAnalysisCore(input: { tokens: ParsedToken[]; rows: MatchRow[] }): CoreAnalysis {
  const { tokens, rows } = input;

  // Ré-attache le token brut par position ; suggestions traitées comme non-match.
  const rawEnriched: EnrichedRow[] = rows.map((r) => {
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

  // NOTATION PROPRIÉTAIRE CosmeCheck (pastille couleur synthétisée en 0-20).
  const pastille = pastilleTone(
    enriched.map((r) => ({ color: r.effective_color, position: r.position_idx })),
    enriched.length,
    false,
  );
  const score = synthScore(pastille) ?? 0;
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

  const categoryTop5Names = byPosition
    .slice(0, 5)
    .map((r) => r.effective_name ?? r.input_raw)
    .filter((n): n is string => Boolean(n));

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

  const items: ItemResponse[] = enriched.map((r) => {
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

  return {
    enriched,
    counts,
    countsPayload: {
      total: enriched.length,
      matched,
      vert: counts["Vert"],
      jaune: counts["Jaune"],
      orange: counts["Orange"],
      rouge: counts["Rouge"],
      unknown: counts["Non reconnu"],
    },
    matched,
    score,
    scoreLabelText,
    scoreTone,
    observations,
    aliasesUsed,
    suggestions,
    spectrum: { top5: spectrumTop5, top10: spectrumTop10 },
    euFragranceAllergens: { detected: allergensDetected, total: EU_ALLERGENS_TOTAL },
    items,
    thresholdFor,
    categoryTop5Names,
  };
}

// ─── Garde-fou d'IDENTITÉ du cache EAN (incident 21 août 2026) ──────────────
// `product_analyses` est keyé par EAN. Quand l'INCI catalogue change, la ligne
// décrit encore l'ANCIEN contenu : l'EAN 3770035517084 (shampoing Vagance, INCI
// naturel) servait l'analyse d'une eau micellaire (POLOXAMER 184 orange en 4e
// position) → étoiles issues de catalog.score, mais liste d'ingrédients,
// restrictions et compatibilité d'un AUTRE produit. Le garde-fou de QUANTITÉ
// (nombre d'items) est aveugle à ce cas, d'où cette vérification de CONTENU.

/** Clé de comparaison d'un nom d'ingrédient : majuscules, sans accent ni
 *  ponctuation. Absorbe espaces, tirets et virgules résiduels. */
export function inciKey(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/**
 * Les items cachés décrivent-ils bien l'INCI qu'on s'apprête à analyser ?
 *
 * Comparaison raw↔raw : le champ `input` d'un item EST le `raw` du parser, donc
 * il s'aligne sur `ParsedToken.raw` du MÊME parser. Se comparer au texte INCI
 * brut produirait de faux désaccords, car le parser retire les alias
 * parenthésés (« Vitis Vinifera (Grape) Seed Oil » → « Vitis Vinifera Seed
 * Oil ») et les astérisques Ecocert.
 *
 * Seuil 0,6 calibré sur la prod (264 639 lignes) : lignes saines ≥ 0,83,
 * réellement périmées ≤ 0,47.
 */
export function cacheMatchesInci(
  cachedItems: ReadonlyArray<{ input?: string }>,
  freshRaws: readonly string[],
): boolean {
  if (cachedItems.length === 0 || freshRaws.length === 0) return false;
  const fresh = new Set(freshRaws.map(inciKey).filter((k) => k.length > 2));
  if (fresh.size === 0) return false;
  let checked = 0;
  let hits = 0;
  for (const it of cachedItems) {
    const key = inciKey(String(it.input ?? ""));
    if (key.length <= 2) continue;
    checked++;
    if (fresh.has(key)) hits++;
  }
  return checked > 0 && hits / checked >= 0.6;
}
