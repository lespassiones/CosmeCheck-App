/**
 * Helpers autonomes (Deno) pour la fonction `routine-suggest`. Port des libs
 * web suivantes, regroupées ici (pas d'ajout à _shared) :
 *   - lib/routine/engine.ts   → computeRoutineMetrics + types
 *   - lib/euAllergens.ts      → EU_FRAGRANCE_ALLERGENS + isEuFragranceAllergen
 *   - lib/skin/profile.ts + lib/skin/promptFormat.ts (sous-ensemble)
 *   - lib/restrictions/types.ts + promptFormat.ts (sous-ensemble)
 *
 * Imports explicites avec extension .ts depuis index.ts.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

// ─── Types analyse (sous-ensemble nécessaire) ───────────────────────────────

export type ColorRating = "Vert" | "Jaune" | "Orange" | "Rouge";

export type AnalyseItem = {
  position?: number;
  input?: string;
  slug: string | null;
  name: string | null;
  colorRating: ColorRating | null;
  tags?: string[] | null;
};

export type AnalyseResponse = {
  counts?: { vert?: number; jaune?: number; orange?: number; rouge?: number };
  items: AnalyseItem[];
};

// ─── EU fragrance allergens ─────────────────────────────────────────────────

type EuAllergen = { inciName: string; label: string; note: string };

export const EU_FRAGRANCE_ALLERGENS: EuAllergen[] = [
  { inciName: "AMYL CINNAMAL", label: "Amyl cinnamal", note: "Parfum synthétique, sensibilisant connu." },
  { inciName: "BENZYL ALCOHOL", label: "Benzyl alcohol", note: "Conservateur et solvant, allergène pour certaines peaux." },
  { inciName: "CINNAMYL ALCOHOL", label: "Cinnamyl alcohol", note: "Composant naturel de la cannelle, sensibilisant." },
  { inciName: "CITRAL", label: "Citral", note: "Note citronnée, sensibilisant fréquent." },
  { inciName: "EUGENOL", label: "Eugenol", note: "Présent dans le clou de girofle, allergène modéré." },
  { inciName: "HYDROXYCITRONELLAL", label: "Hydroxycitronellal", note: "Note florale synthétique, sensibilisant connu." },
  { inciName: "ISOEUGENOL", label: "Isoeugenol", note: "Restreint UE pour son potentiel allergisant." },
  { inciName: "AMYLCINNAMYL ALCOHOL", label: "Amylcinnamyl alcohol", note: "Note florale, sensibilisant." },
  { inciName: "BENZYL SALICYLATE", label: "Benzyl salicylate", note: "Fixateur de parfum, sensibilisant léger." },
  { inciName: "CINNAMAL", label: "Cinnamal", note: "Composant naturel de la cannelle, allergène." },
  { inciName: "COUMARIN", label: "Coumarin", note: "Note vanillée, sensibilisant connu." },
  { inciName: "GERANIOL", label: "Geraniol", note: "Note florale présente dans le géranium, sensibilisant fréquent." },
  { inciName: "ANISE ALCOHOL", label: "Anise alcohol", note: "Note anisée, sensibilisant." },
  { inciName: "BENZYL CINNAMATE", label: "Benzyl cinnamate", note: "Fixateur de parfum, sensibilisant." },
  { inciName: "FARNESOL", label: "Farnesol", note: "Note florale, sensibilisant." },
  { inciName: "BUTYLPHENYL METHYLPROPIONAL", label: "Butylphenyl methylpropional", note: "Aussi appelé Lilial - restreint UE depuis 2022." },
  { inciName: "LINALOOL", label: "Linalool", note: "Note florale (lavande, bergamote), sensibilisant après oxydation." },
  { inciName: "BENZYL BENZOATE", label: "Benzyl benzoate", note: "Fixateur de parfum, sensibilisant modéré." },
  { inciName: "CITRONELLOL", label: "Citronellol", note: "Note florale citronnée, sensibilisant léger." },
  { inciName: "HEXYL CINNAMAL", label: "Hexyl cinnamal", note: "Note florale synthétique, sensibilisant." },
  { inciName: "LIMONENE", label: "Limonene", note: "Note citronnée, sensibilisant après oxydation (très commun)." },
  { inciName: "METHYL 2-OCTYNOATE", label: "Methyl 2-octynoate", note: "Note verte, sensibilisant rare." },
  { inciName: "ALPHA-ISOMETHYL IONONE", label: "α-Isomethyl ionone", note: "Note florale, sensibilisant." },
  { inciName: "EVERNIA PRUNASTRI EXTRACT", label: "Evernia prunastri (mousse de chêne)", note: "Extrait naturel de mousse, fort sensibilisant." },
  { inciName: "EVERNIA FURFURACEA EXTRACT", label: "Evernia furfuracea (mousse d'arbre)", note: "Extrait naturel de mousse, fort sensibilisant." },
  { inciName: "HYDROXYISOHEXYL 3-CYCLOHEXENE CARBOXALDEHYDE", label: "HICC (Lyral)", note: "Lyral - INTERDIT dans l'UE depuis 2021, signal d'alerte fort." },
];

const EU_NAMES_SET = new Set(EU_FRAGRANCE_ALLERGENS.map((a) => a.inciName));

export function isEuFragranceAllergen(inciName: string): boolean {
  return EU_NAMES_SET.has(inciName.toUpperCase().trim());
}

// ─── Routine engine ─────────────────────────────────────────────────────────

export type Frequency = "daily" | "weekly" | "monthly";

const FREQ_WEIGHT: Record<Frequency, number> = {
  daily: 1.0,
  weekly: 1 / 7,
  monthly: 1 / 30,
};

const PENALTY: Record<string, number> = { Vert: 0, Jaune: 0.6, Orange: 2.0, Rouge: 4.0 };
const RATING_RANK: Record<string, number> = { Vert: 1, Jaune: 2, Orange: 3, Rouge: 4 };
const COLOR_ORDER = ["Vert", "Jaune", "Orange", "Rouge"] as const;

export type RoutineProduct = {
  id: string;
  name: string;
  frequency: Frequency;
  score: number | null;
  result: AnalyseResponse;
};

export type RoutineMetrics = {
  exposureScore: number;
  exposureLabel: "Faible" | "Modérée" | "Élevée" | "Très élevée";
  totalUseUnits: number;
  penalizingProductsCount: number;
  colorCounts: { vert: number; jaune: number; orange: number; rouge: number };
  tagExposure: { tag: string; label: string; cumulativeCount: number; colorSegments: { color: string; fraction: number }[] }[];
  topIngredients: {
    name: string;
    slug: string | null;
    colorRating: ColorRating | null;
    productCount: number;
    weightedExposure: number;
  }[];
  allergenOverlap: { inciName: string; label: string; productCount: number }[];
  simulation: {
    minus1: { exposureScore: number; removedName: string | null };
    minus2: { exposureScore: number; removedNames: string[] };
    worstProducts: {
      id: string;
      name: string;
      score: number | null;
      worstIngredients: { name: string; slug: string | null; colorRating: ColorRating | null; tags: string[] }[];
    }[];
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

function penaltyPerUse(score: number | null): number {
  if (score === null || Number.isNaN(score)) return 0;
  return Math.max(0, 20 - score);
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

  // Tag exposure
  const tagMap = new Map<string, number>();
  const tagIngColors = new Map<string, Map<string, string | null>>();
  for (const p of products) {
    const weight = FREQ_WEIGHT[p.frequency];
    const tagsInProduct = new Set<string>();
    for (const it of p.result.items) {
      for (const t of it.tags ?? []) {
        tagsInProduct.add(t);
        const key = (it.slug ?? it.name ?? it.input ?? "").toUpperCase();
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
      const ingColors = tagIngColors.get(tag) ?? new Map<string, string | null>();
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

  // Top ingredients
  type IngAccum = {
    name: string;
    slug: string | null;
    colorRating: ColorRating | null;
    productCount: number;
    weightedExposure: number;
  };
  const ingMap = new Map<string, IngAccum>();
  for (const p of products) {
    const weight = FREQ_WEIGHT[p.frequency];
    const seen = new Set<string>();
    for (const it of p.result.items) {
      if (!it.colorRating || it.colorRating === "Vert") continue;
      const key = (it.slug ?? it.name ?? it.input ?? "").toUpperCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const cur = ingMap.get(key);
      const penalty = PENALTY[it.colorRating] ?? 0;
      if (cur) {
        cur.productCount += 1;
        cur.weightedExposure += weight * penalty;
      } else {
        ingMap.set(key, {
          name: it.name ?? it.input ?? "",
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

  // EU fragrance allergen overlap (2+ products)
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
  const allergenOverlap = Array.from(allergenCount.entries())
    .filter(([, v]) => v.products.size >= 2)
    .map(([inciName, v]) => ({ inciName, label: v.label, productCount: v.products.size }))
    .sort((a, b) => b.productCount - a.productCount);

  // Simulation
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
        name: it.name ?? it.input ?? "",
        slug: it.slug,
        colorRating: it.colorRating,
        tags: it.tags ?? [],
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

  const penalizingProductsCount = products.filter(
    (p) => typeof p.score === "number" && p.score < 13,
  ).length;

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

// ─── Profil + restrictions → blocs de prompt ────────────────────────────────

const SKIN_TYPE_FACE_LABEL: Record<string, string> = {
  seche: "Sèche", mixte: "Mixte", grasse: "Grasse", sensible: "Sensible", normale: "Normale",
};
const SKIN_TYPES_FACE = ["seche", "mixte", "grasse", "sensible", "normale"];
const SKIN_TYPE_BODY_LABEL: Record<string, string> = {
  seche: "Sèche", tres_seche: "Très sèche / atopique", normale: "Normale",
  sensible: "Sensible / réactive", mixte: "Mixte (zones sèches et grasses)",
};
const SKIN_TYPES_BODY = ["seche", "tres_seche", "normale", "sensible", "mixte"];
const SKIN_CONCERN_LABEL: Record<string, string> = {
  acne: "Acné / boutons", rides: "Rides et ridules", taches: "Taches pigmentaires",
  secheresse: "Sécheresse / déshydratation", rougeurs: "Rougeurs", sensibilite: "Sensibilité",
  pores_dilates: "Pores dilatés", exces_sebum: "Excès de sébum / brillance",
  cernes_poches: "Cernes / poches", vergetures_cellulite: "Cellulite / vergetures",
  "anti-age": "Rides et ridules", cuir_chevelu: "Cuir chevelu", cheveux: "Cheveux (longueurs)",
};
const SKIN_CONCERNS = [
  "acne", "rides", "taches", "secheresse", "rougeurs", "sensibilite",
  "pores_dilates", "exces_sebum", "cernes_poches", "vergetures_cellulite",
];
const HAIR_CONCERN_LABEL: Record<string, string> = {
  secs: "Secs", gras: "Gras", cuir_chevelu_sensible: "Cuir chevelu sensible / affecté",
  chute: "Chute de cheveux", pellicules: "Pellicules", ternes_cassants: "Cheveux ternes / cassants",
};
const HAIR_CONCERNS = ["secs", "gras", "cuir_chevelu_sensible", "chute", "pellicules", "ternes_cassants"];

type SkinProfile = {
  skinTypeFace?: string;
  otherSkinTypeFace?: string;
  skinTypeBody?: string;
  otherSkinTypeBody?: string;
  concerns?: string[];
  hairConcerns?: string[];
  allergiesFreeform?: string;
  otherConcerns?: string;
  otherHair?: string;
  otherNotes?: string;
};

function readSkinProfile(prefs: Record<string, unknown> | null | undefined): SkinProfile {
  if (!prefs || typeof prefs !== "object") return {};
  const raw = (prefs as { skin?: unknown }).skin;
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;

  const rawConcerns: string[] = Array.isArray(r.concerns)
    ? (r.concerns as unknown[]).filter(
        (c): c is string =>
          typeof c === "string"
          && (SKIN_CONCERNS.includes(c) || c === "anti-age" || c === "cuir_chevelu" || c === "cheveux"),
      )
    : [];
  const cleanedConcerns = rawConcerns
    .filter((c) => c !== "cuir_chevelu" && c !== "cheveux")
    .map((c) => (c === "anti-age" ? "rides" : c));

  const rawHair = Array.isArray(r.hairConcerns)
    ? (r.hairConcerns as unknown[]).filter((c): c is string => typeof c === "string" && HAIR_CONCERNS.includes(c))
    : [];
  const hairSet = new Set<string>(rawHair);
  if (rawConcerns.includes("cuir_chevelu")) hairSet.add("cuir_chevelu_sensible");

  const readShort = (key: string, max: number): string | undefined => {
    const v = r[key];
    if (typeof v !== "string") return undefined;
    const trimmed = v.trim();
    return trimmed.length > 0 ? trimmed.slice(0, max) : undefined;
  };

  const skinTypeFace = SKIN_TYPES_FACE.includes(r.skinTypeFace as string) ? (r.skinTypeFace as string) : undefined;
  const newBody = SKIN_TYPES_BODY.includes(r.skinTypeBody as string) ? (r.skinTypeBody as string) : undefined;
  const legacyBody = SKIN_TYPES_BODY.includes(r.skinType as string) ? (r.skinType as string) : undefined;

  return {
    skinTypeFace,
    otherSkinTypeFace: readShort("otherSkinTypeFace", 120),
    skinTypeBody: newBody ?? legacyBody,
    otherSkinTypeBody: readShort("otherSkinTypeBody", 120) ?? readShort("otherSkinType", 120),
    concerns: cleanedConcerns.length > 0 ? cleanedConcerns : undefined,
    hairConcerns: hairSet.size > 0 ? Array.from(hairSet) : undefined,
    allergiesFreeform: readShort("allergiesFreeform", 500),
    otherConcerns: readShort("otherConcerns", 300),
    otherHair: readShort("otherHair", 200),
    otherNotes: readShort("otherNotes", 500),
  };
}

function formatSkinProfileForPrompt(skin: SkinProfile): string | null {
  const lines: string[] = [];

  const faceParts: string[] = [];
  if (skin.skinTypeFace) faceParts.push(SKIN_TYPE_FACE_LABEL[skin.skinTypeFace] ?? skin.skinTypeFace);
  if (skin.otherSkinTypeFace) faceParts.push(`précision : ${skin.otherSkinTypeFace}`);
  if (faceParts.length > 0) lines.push(`- Type de peau visage : ${faceParts.join(" — ")}`);

  const bodyParts: string[] = [];
  if (skin.skinTypeBody) bodyParts.push(SKIN_TYPE_BODY_LABEL[skin.skinTypeBody] ?? skin.skinTypeBody);
  if (skin.otherSkinTypeBody) bodyParts.push(`précision : ${skin.otherSkinTypeBody}`);
  if (bodyParts.length > 0) lines.push(`- Type de peau corps : ${bodyParts.join(" — ")}`);

  const concernParts: string[] = [];
  if (skin.concerns && skin.concerns.length > 0) {
    concernParts.push(skin.concerns.map((c) => SKIN_CONCERN_LABEL[c] ?? c).join(", "));
  }
  if (skin.otherConcerns) concernParts.push(skin.otherConcerns);
  if (concernParts.length > 0) lines.push(`- Préoccupations : ${concernParts.join(" ; ")}`);

  const hairParts: string[] = [];
  if (skin.hairConcerns && skin.hairConcerns.length > 0) {
    hairParts.push(skin.hairConcerns.map((c) => HAIR_CONCERN_LABEL[c] ?? c).join(", "));
  }
  if (skin.otherHair) hairParts.push(skin.otherHair);
  if (hairParts.length > 0) lines.push(`- Cheveux : ${hairParts.join(" ; ")}`);

  if (skin.allergiesFreeform) lines.push(`- Allergies / intolérances : ${skin.allergiesFreeform}`);
  if (skin.otherNotes) lines.push(`- Autres précisions : ${skin.otherNotes}`);

  if (lines.length === 0) return null;

  return [
    "PROFIL DE L'UTILISATEUR (à prendre en compte pour personnaliser ta réponse) :",
    ...lines,
    "Adapte tes recommandations à ce profil. Cite les éléments du profil quand c'est pertinent (ex : « pour une peau sèche, … »).",
  ].join("\n");
}

type UserRestrictions = { families: string[]; ingredients: { slug: string; name: string }[] };

function readUserRestrictions(prefs: Record<string, unknown> | null | undefined): UserRestrictions {
  if (!prefs || typeof prefs !== "object") return { families: [], ingredients: [] };
  const raw = (prefs as { restrictions?: unknown }).restrictions;
  if (!raw || typeof raw !== "object") return { families: [], ingredients: [] };
  const r = raw as Record<string, unknown>;

  const families = Array.isArray(r.families)
    ? (r.families as unknown[]).filter((s): s is string => typeof s === "string" && s.length > 0).slice(0, 60)
    : [];
  const ingredients = Array.isArray(r.ingredients)
    ? (r.ingredients as unknown[])
        .map((it): { slug: string; name: string } | null => {
          if (!it || typeof it !== "object") return null;
          const obj = it as Record<string, unknown>;
          const slug = typeof obj.slug === "string" ? obj.slug.trim() : "";
          const name = typeof obj.name === "string" ? obj.name.trim() : "";
          if (!slug || !name) return null;
          return { slug, name };
        })
        .filter((x): x is { slug: string; name: string } => x !== null)
        .slice(0, 80)
    : [];

  return { families, ingredients };
}

function formatRestrictionsForPrompt(
  restrictions: UserRestrictions,
  familyLabels: Map<string, string>,
): string | null {
  if (restrictions.families.length === 0 && restrictions.ingredients.length === 0) return null;

  const familyNames = restrictions.families
    .map((slug) => familyLabels.get(slug))
    .filter((n): n is string => Boolean(n));
  const ingredientNames = restrictions.ingredients.map((i) => i.name);

  const lines: string[] = [];
  if (familyNames.length > 0) lines.push(`- Familles d'ingrédients à éviter : ${familyNames.join(", ")}`);
  if (ingredientNames.length > 0) lines.push(`- Ingrédients individuels à éviter : ${ingredientNames.join(", ")}`);
  if (lines.length === 0) return null;

  return [
    "RESTRICTIONS DE L'UTILISATEUR (à respecter dans tes recommandations) :",
    ...lines,
    "Signale-lui en clair lorsqu'un produit contient un de ces éléments. Ne propose jamais un produit qui contient l'un d'eux comme alternative.",
  ].join("\n");
}

/**
 * Charge le profil utilisateur (preferences) en une lecture, et renvoie les
 * deux blocs de prompt (profil + restrictions). Lit aussi ingredient_families
 * pour résoudre les libellés de familles si des restrictions existent.
 * Best-effort : tout échec renvoie des blocs null (le prompt générique).
 */
export async function loadProfileAndRestrictionsBlocks(
  sb: SupabaseClient,
  userId: string,
): Promise<{ profileBlock: string | null; restrictionsBlock: string | null }> {
  try {
    const { data } = await sb
      .schema("cosme_check")
      .from("user_profiles")
      .select("preferences")
      .eq("id", userId)
      .maybeSingle();
    const prefs = ((data as { preferences?: unknown } | null)?.preferences ?? null) as
      | Record<string, unknown>
      | null;

    const skin = readSkinProfile(prefs);
    const profileBlock = formatSkinProfileForPrompt(skin);

    const restrictions = readUserRestrictions(prefs);
    let restrictionsBlock: string | null = null;
    if (restrictions.families.length > 0 || restrictions.ingredients.length > 0) {
      let labels = new Map<string, string>();
      if (restrictions.families.length > 0) {
        try {
          const { data: fams } = await sb
            .schema("cosme_check")
            .from("ingredient_families")
            .select("slug, name")
            .eq("active", true);
          labels = new Map(
            ((fams ?? []) as { slug: string; name: string }[]).map((f) => [f.slug, f.name] as const),
          );
        } catch {
          // ignore — familles non résolues, on garde les ingrédients individuels
        }
      }
      restrictionsBlock = formatRestrictionsForPrompt(restrictions, labels);
    }

    return { profileBlock, restrictionsBlock };
  } catch {
    return { profileBlock: null, restrictionsBlock: null };
  }
}
