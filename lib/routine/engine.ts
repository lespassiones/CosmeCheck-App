/**
 * Routine analytics engine.
 *
 * Inputs: an array of (analysis, frequency) tuples.
 * Outputs:
 *   - exposureScore /20 - weighted average penalty per use, normalized.
 *   - tagExposure   - cumulative occurrences per tag, weighted by use frequency.
 *   - topIngredients- ingredients most cumulatively encountered (frequency × penalty).
 *   - allergenOverlap - EU fragrance allergens present in 2+ products.
 *   - simulation    - projected exposure if the worst 1/2 products are removed.
 */
import { EU_FRAGRANCE_ALLERGENS, isEuFragranceAllergen } from "@/lib/euAllergens";
import type { AnalyseItem, AnalyseResponse } from "@/lib/analysis/types";

export type Frequency = "daily" | "weekly" | "monthly";

const FREQ_WEIGHT: Record<Frequency, number> = {
  daily: 1.0,
  weekly: 1 / 7,
  monthly: 1 / 30,
};

const PENALTY: Record<string, number> = {
  Vert: 0,
  Jaune: 0.6,
  Orange: 2.0,
  Rouge: 4.0,
};

const RATING_RANK: Record<string, number> = { Vert: 1, Jaune: 2, Orange: 3, Rouge: 4 };
const COLOR_ORDER = ["Vert", "Jaune", "Orange", "Rouge"] as const;

export type RoutineProduct = {
  id: string;            // analysis id
  name: string;
  frequency: Frequency;
  score: number | null;  // /20
  result: AnalyseResponse;
};

export type RoutineMetrics = {
  exposureScore: number;        // /20 - higher = safer
  exposureLabel: "Faible" | "Modérée" | "Élevée" | "Très élevée";
  totalUseUnits: number;        // sum of frequency weights
  /** Count of routine products whose own score falls in orange/rose band (< 13/20). */
  penalizingProductsCount: number;
  /**
   * Cumulative ingredient color distribution across the whole routine,
   * weighted by use frequency (daily=1, weekly=1/7, monthly=1/30) - same
   * weighting as the exposure score, so a daily product contributes more
   * than a monthly one. Values are floats; only ratios are meaningful
   * (used to drive the routine ingredient blob).
   */
  colorCounts: { vert: number; jaune: number; orange: number; rouge: number };
  tagExposure: { tag: string; label: string; cumulativeCount: number; colorSegments: { color: string; fraction: number }[] }[];
  topIngredients: {
    name: string;
    slug: string | null;
    colorRating: AnalyseItem["colorRating"];
    productCount: number;       // how many distinct routine products contain it
    weightedExposure: number;   // sum of frequency weights of those products × penalty
  }[];
  allergenOverlap: {
    inciName: string;
    label: string;
    productCount: number;       // 2+ products
  }[];
  simulation: {
    /** Exposure score if the single worst product is removed. */
    minus1: { exposureScore: number; removedName: string | null };
    /** Exposure score if all suggested-to-remove products are removed. */
    minus2: { exposureScore: number; removedNames: string[] };
    /** Detailed info on the 1-2 worst products (id, name, score, top problematic ingredients). */
    worstProducts: {
      id: string;
      name: string;
      score: number | null;
      worstIngredients: {
        name: string;
        slug: string | null;
        colorRating: AnalyseItem["colorRating"];
        tags: string[];
      }[];
    }[];
    /**
     * How many products are actually worth removing (0, 1 or 2).
     * 0 → no penalizing product, hide the simulation card.
     * 1 → suggest removing the worst one only.
     * 2 → suggest removing the two worst ones.
     */
    removableCount: 0 | 1 | 2;
  };
};

const TAG_LABELS: Record<string, string> = {
  paraben: "Parabens",
  silicone: "Silicones",
  sulfate: "Sulfates",
  "huile-minerale": "Huiles minérales",
  ethoxyle: "Composés éthoxylés",
  "colorant-synthese": "Colorants de synthèse",
  "ammonium-quaternaire": "Ammoniums quaternaires",
  "allergene-parfumant": "Allergènes parfumants",
  conservateur: "Conservateurs",
  "parfum-synthese": "Parfums de synthèse",
  "huile-essentielle": "Huiles essentielles",
  ogm: "OGM",
};

function exposureLabelFor(score: number): RoutineMetrics["exposureLabel"] {
  if (score >= 17) return "Faible";
  if (score >= 13) return "Modérée";
  if (score >= 9) return "Élevée";
  return "Très élevée";
}

/**
 * Compute the exposure for a SINGLE product, as a "penalty / use".
 * We use the inverse-of-score so that "weighted average" stays linear.
 *
 *   penaltyPerUse(product) = 20 - product.score
 *   exposure(product) = penaltyPerUse × frequencyWeight
 *
 * Routine exposure score = 20 - sum(weightedPenalty) / max(1, totalUnits)
 */
function penaltyPerUse(score: number | null): number {
  if (score === null || Number.isNaN(score)) return 0;
  return Math.max(0, 20 - score);
}

/** Un allergène parfumant UE présent dans 2+ produits, avec les ids concernés. */
export type AllergenOverlapEntry = {
  inciName: string;
  label: string;
  productIds: string[];
};

/**
 * Détection des allergènes parfumants UE présents dans AU MOINS 2 produits.
 * Extraite (juillet 2026) de computeRoutineMetrics pour être RÉUTILISÉE par le
 * moteur de conflits de routine (règle allergen-duplication) : une seule source
 * de vérité, computeRoutineMetrics en dérive `productCount = productIds.length`.
 */
export function computeAllergenOverlap(
  products: { id: string; result: { items: AnalyseItem[] } }[],
): AllergenOverlapEntry[] {
  const allergenCount = new Map<string, { label: string; products: Set<string> }>();
  for (const p of products) {
    for (const it of p.result.items) {
      const candidates = [it.name, it.input].filter((v): v is string => Boolean(v));
      for (const c of candidates) {
        if (isEuFragranceAllergen(c)) {
          const upper = c.toUpperCase();
          const meta = EU_FRAGRANCE_ALLERGENS.find((a) => a.inciName === upper)!;
          if (!allergenCount.has(upper)) {
            allergenCount.set(upper, { label: meta.label, products: new Set() });
          }
          allergenCount.get(upper)!.products.add(p.id);
          break;
        }
      }
    }
  }
  return Array.from(allergenCount.entries())
    .filter(([, v]) => v.products.size >= 2)
    .map(([inciName, v]) => ({
      inciName,
      label: v.label,
      productIds: Array.from(v.products),
    }))
    .sort((a, b) => b.productIds.length - a.productIds.length);
}

export function computeRoutineMetrics(products: RoutineProduct[]): RoutineMetrics {
  if (products.length === 0) {
    return {
      exposureScore: 20,
      exposureLabel: "Faible",
      totalUseUnits: 0,
      penalizingProductsCount: 0,
      colorCounts: { vert: 0, jaune: 0, orange: 0, rouge: 0 },
      tagExposure: [],
      topIngredients: [],
      allergenOverlap: [],
      simulation: {
        minus1: { exposureScore: 20, removedName: null },
        minus2: { exposureScore: 20, removedNames: [] },
        worstProducts: [],
        removableCount: 0,
      },
    };
  }

  const totalUseUnits = products.reduce((sum, p) => sum + FREQ_WEIGHT[p.frequency], 0);

  function scoreOf(list: RoutineProduct[]): number {
    if (list.length === 0) return 20;
    const total = list.reduce((s, p) => s + FREQ_WEIGHT[p.frequency], 0);
    const weighted = list.reduce(
      (s, p) => s + penaltyPerUse(p.score) * FREQ_WEIGHT[p.frequency],
      0,
    );
    return Math.max(0, Math.min(20, 20 - weighted / Math.max(total, 0.0001)));
  }
  const exposureScore = scoreOf(products);

  // Tag exposure - weighted by frequency, sum across all products.
  // Also track worst colorRating per unique ingredient per tag for multi-color bars.
  const tagMap = new Map<string, number>();
  const tagIngColors = new Map<string, Map<string, string | null>>();
  for (const p of products) {
    const weight = FREQ_WEIGHT[p.frequency];
    const tagsInProduct = new Set<string>();
    for (const it of p.result.items) {
      for (const t of (Array.isArray(it.tags) ? it.tags : [])) {
        tagsInProduct.add(t);
        const key = (it.slug ?? it.name ?? it.input).toUpperCase();
        if (!tagIngColors.has(t)) tagIngColors.set(t, new Map());
        const ingMap = tagIngColors.get(t)!;
        const existingRank = RATING_RANK[ingMap.get(key) ?? ""] ?? 0;
        const newRank = RATING_RANK[it.colorRating ?? ""] ?? 0;
        if (newRank > existingRank || !ingMap.has(key)) {
          ingMap.set(key, it.colorRating ?? null);
        }
      }
    }
    for (const t of tagsInProduct) {
      tagMap.set(t, (tagMap.get(t) ?? 0) + weight);
    }
  }
  const tagExposure = Array.from(tagMap.entries())
    .map(([tag, cumulativeCount]) => {
      const ingColors = tagIngColors.get(tag) ?? new Map();
      const counts: Record<string, number> = { Vert: 0, Jaune: 0, Orange: 0, Rouge: 0 };
      for (const color of ingColors.values()) {
        if (color && color in counts) counts[color]++;
      }
      const total = COLOR_ORDER.reduce((s, c) => s + counts[c], 0);
      const colorSegments = total === 0
        ? []
        : COLOR_ORDER
            .map((c) => ({ color: c, fraction: counts[c] / total }))
            .filter((s) => s.fraction > 0);
      return {
        tag,
        label: TAG_LABELS[tag] ?? tag,
        cumulativeCount: Number(cumulativeCount.toFixed(2)),
        colorSegments,
      };
    })
    .sort((a, b) => b.cumulativeCount - a.cumulativeCount);

  // Top ingredients - most cumulatively encountered, weighted by frequency × penalty.
  // We only consider non-green ingredients so the top list highlights what to address.
  type IngAccum = {
    name: string;
    slug: string | null;
    colorRating: AnalyseItem["colorRating"];
    productCount: number;
    weightedExposure: number;
  };
  const ingMap = new Map<string, IngAccum>();
  for (const p of products) {
    const weight = FREQ_WEIGHT[p.frequency];
    const seen = new Set<string>();
    for (const it of p.result.items) {
      if (!it.colorRating || it.colorRating === "Vert") continue;
      const key = (it.slug ?? it.name ?? it.input).toUpperCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const cur = ingMap.get(key);
      const penalty = PENALTY[it.colorRating] ?? 0;
      if (cur) {
        cur.productCount += 1;
        cur.weightedExposure += weight * penalty;
      } else {
        ingMap.set(key, {
          name: it.name ?? it.input,
          slug: it.slug,
          colorRating: it.colorRating,
          productCount: 1,
          weightedExposure: weight * penalty,
        });
      }
    }
  }
  const topIngredients = Array.from(ingMap.values())
    .sort((a, b) => b.weightedExposure - a.weightedExposure || b.productCount - a.productCount)
    .slice(0, 5)
    .map((i) => ({ ...i, weightedExposure: Number(i.weightedExposure.toFixed(2)) }));

  // EU fragrance allergens overlap - present in 2+ products.
  // Dérivé de la source UNIQUE computeAllergenOverlap (réutilisée par le moteur
  // de conflits de routine, règle allergen-duplication) : ici on mappe
  // productCount = productIds.length. Zéro changement de sortie (même filtre
  // 2+ produits, même tri par nombre de produits décroissant).
  const allergenOverlap = computeAllergenOverlap(products).map((e) => ({
    inciName: e.inciName,
    label: e.label,
    productCount: e.productIds.length,
  }));

  // Simulation : suggest removing ONLY products that are actually
  // penalizing. A product is "removable" when at least one of these is true:
  //   - it contains at least one Rouge ingredient (high concern)
  //   - its own score is in the orange/rose band (< 13/20)
  //   - it stacks a lot of irritants (>= 5 Orange + Jaune combined)
  // Sorted by impact: more Rouge first, then Orange, then Jaune, then lowest
  // own score. Capped at 2 - proposing to remove every product in the routine
  // (and pretending the user reaches 20/20) is dishonest.
  function ratingCounts(p: RoutineProduct) {
    let rouge = 0;
    let orange = 0;
    let jaune = 0;
    for (const it of p.result.items) {
      if (it.colorRating === "Rouge") rouge++;
      else if (it.colorRating === "Orange") orange++;
      else if (it.colorRating === "Jaune") jaune++;
    }
    return { rouge, orange, jaune };
  }

  const removable = products
    .map((p) => ({ product: p, counts: ratingCounts(p) }))
    .filter(({ product, counts }) => {
      if (counts.rouge >= 1) return true;
      if (typeof product.score === "number" && product.score < 13) return true;
      if (counts.orange + counts.jaune >= 5) return true;
      return false;
    })
    .sort((a, b) => {
      if (b.counts.rouge !== a.counts.rouge) return b.counts.rouge - a.counts.rouge;
      if (b.counts.orange !== a.counts.orange) return b.counts.orange - a.counts.orange;
      if (b.counts.jaune !== a.counts.jaune) return b.counts.jaune - a.counts.jaune;
      return (a.product.score ?? 20) - (b.product.score ?? 20);
    })
    .slice(0, 2)
    .map((c) => c.product);

  const removableCount = removable.length as 0 | 1 | 2;
  const removeFirstId = removable[0]?.id;
  const removeIds = new Set(removable.map((p) => p.id));

  const projectedMinus1 = removeFirstId
    ? products.filter((p) => p.id !== removeFirstId)
    : products;
  const projectedMinusAll = removeIds.size > 0
    ? products.filter((p) => !removeIds.has(p.id))
    : products;

  // Per-product detail for the simulation modal: surface the 5 worst
  // (Rouge then Orange) ingredients of each suggested product so the user
  // sees *why* removing it matters.
  const worstProducts = removable.map((p) => {
    const ranked = [...p.result.items]
      .filter((it) => it.colorRating === "Rouge" || it.colorRating === "Orange")
      .sort((a, b) => {
        const ra = a.colorRating === "Rouge" ? 0 : 1;
        const rb = b.colorRating === "Rouge" ? 0 : 1;
        if (ra !== rb) return ra - rb;
        return (a.position ?? 999) - (b.position ?? 999);
      })
      .slice(0, 5);
    return {
      id: p.id,
      name: p.name,
      score: p.score,
      worstIngredients: ranked.map((it) => ({
        name: it.name ?? it.input,
        slug: it.slug,
        colorRating: it.colorRating,
        tags: (Array.isArray(it.tags) ? it.tags : []),
      })),
    };
  });
  const simulation = {
    minus1: {
      exposureScore: Number(scoreOf(projectedMinus1).toFixed(1)),
      removedName: removable[0]?.name ?? null,
    },
    minus2: {
      exposureScore: Number(scoreOf(projectedMinusAll).toFixed(1)),
      removedNames: removable.map((p) => p.name),
    },
    worstProducts,
    removableCount,
  };

  // Products that are themselves "penalizing": their own score is < 13/20
  // (i.e. orange/rose band - Bien threshold sits at 13).
  const penalizingProductsCount = products.filter(
    (p) => typeof p.score === "number" && p.score < 13,
  ).length;

  // Frequency-weighted ingredient colour distribution: each product's
  // counts.{vert,jaune,orange,rouge} are multiplied by its FREQ_WEIGHT,
  // so a daily product contributes 7× more than a weekly one - same
  // weighting model as the exposure score.
  const colorCounts = products.reduce(
    (acc, p) => {
      const w = FREQ_WEIGHT[p.frequency];
      const c = p.result?.counts;
      if (c) {
        acc.vert += (c.vert ?? 0) * w;
        acc.jaune += (c.jaune ?? 0) * w;
        acc.orange += (c.orange ?? 0) * w;
        acc.rouge += (c.rouge ?? 0) * w;
      }
      return acc;
    },
    { vert: 0, jaune: 0, orange: 0, rouge: 0 },
  );

  return {
    exposureScore: Number(exposureScore.toFixed(1)),
    exposureLabel: exposureLabelFor(exposureScore),
    totalUseUnits: Number(totalUseUnits.toFixed(2)),
    penalizingProductsCount,
    colorCounts,
    tagExposure,
    topIngredients,
    allergenOverlap,
    simulation,
  };
}
