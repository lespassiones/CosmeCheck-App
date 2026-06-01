/**
 * INCI → nom commun en français pour les ingrédients "grand public" - ceux
 * qu'un consommateur reconnaît dans la salle de bain : eau, huiles
 * végétales, beurres, vitamines courantes, parfum, cires, argiles.
 *
 * On reste volontairement étroit : pas de traduction littérale des
 * conservateurs techniques, des tensioactifs ou des esters obscurs. L'idée
 * est d'aider à la lecture, pas de tout franciser.
 *
 * Utilisé en post-traitement de la synthèse côté frontend pour rendre des
 * passages type "**AQUA**, suivi du **PERSEA GRATISSIMA OIL**" sous la
 * forme "eau (Aqua), suivi de l'huile d'avocat (Persea Gratissima Oil)".
 * Le LLM n'est pas au courant - c'est uniquement un overlay d'affichage.
 *
 * Les clés sont normalisées (lowercase, sans diacritique, ponctuation
 * collapsée en espace) pour matcher la sortie de `normaliseSynthesisToken`
 * dans AnalyseResultPanel.tsx.
 *
 * Port byte-for-byte du web `lib/inciCommonNames.ts`.
 */

const RAW: Record<string, string> = {
  // ── Eau & solvants courants ──────────────────────────────────────────────
  "AQUA": "eau",
  "WATER": "eau",
  "EAU": "eau",
  "AQUA/WATER/EAU": "eau",
  "AQUA / WATER / EAU": "eau",
  "ALCOHOL": "alcool",
  "ALCOHOL DENAT": "alcool",
  "ALCOHOL DENAT.": "alcool",
  "ETHANOL": "alcool",
  "GLYCERIN": "glycérine",
  "GLYCERINE": "glycérine",

  // ── Huiles végétales connues ─────────────────────────────────────────────
  "COCOS NUCIFERA OIL": "huile de coco",
  "COCONUT OIL": "huile de coco",
  "OLEA EUROPAEA FRUIT OIL": "huile d'olive",
  "OLIVE OIL": "huile d'olive",
  "PRUNUS AMYGDALUS DULCIS OIL": "huile d'amande douce",
  "SWEET ALMOND OIL": "huile d'amande douce",
  "ARGANIA SPINOSA KERNEL OIL": "huile d'argan",
  "ARGAN OIL": "huile d'argan",
  "SIMMONDSIA CHINENSIS SEED OIL": "huile de jojoba",
  "JOJOBA OIL": "huile de jojoba",
  "HELIANTHUS ANNUUS SEED OIL": "huile de tournesol",
  "SUNFLOWER OIL": "huile de tournesol",
  "PERSEA GRATISSIMA OIL": "huile d'avocat",
  "AVOCADO OIL": "huile d'avocat",
  "ROSA CANINA FRUIT OIL": "huile de rose musquée",
  "ROSEHIP OIL": "huile de rose musquée",
  "VITIS VINIFERA SEED OIL": "huile de pépins de raisin",
  "GRAPESEED OIL": "huile de pépins de raisin",
  "MACADAMIA TERNIFOLIA SEED OIL": "huile de macadamia",
  "MACADAMIA OIL": "huile de macadamia",
  "RICINUS COMMUNIS SEED OIL": "huile de ricin",
  "CASTOR OIL": "huile de ricin",
  "CANNABIS SATIVA SEED OIL": "huile de chanvre",
  "HEMP SEED OIL": "huile de chanvre",
  "ROSA MOSCHATA SEED OIL": "huile de rose musquée",
  "PRUNUS ARMENIACA KERNEL OIL": "huile d'abricot",
  "APRICOT KERNEL OIL": "huile d'abricot",

  // ── Beurres végétaux ─────────────────────────────────────────────────────
  "BUTYROSPERMUM PARKII": "beurre de karité",
  "BUTYROSPERMUM PARKII BUTTER": "beurre de karité",
  "SHEA BUTTER": "beurre de karité",
  "THEOBROMA CACAO SEED BUTTER": "beurre de cacao",
  "COCOA BUTTER": "beurre de cacao",
  "MANGIFERA INDICA SEED BUTTER": "beurre de mangue",
  "MANGO BUTTER": "beurre de mangue",

  // ── Actifs grand public ──────────────────────────────────────────────────
  "HYALURONIC ACID": "acide hyaluronique",
  "SODIUM HYALURONATE": "acide hyaluronique",
  "ASCORBIC ACID": "vitamine C",
  "L-ASCORBIC ACID": "vitamine C",
  "SALICYLIC ACID": "acide salicylique",
  "LACTIC ACID": "acide lactique",
  "GLYCOLIC ACID": "acide glycolique",
  "AZELAIC ACID": "acide azélaïque",
  "RETINOL": "rétinol",
  "NIACINAMIDE": "vitamine B3",
  "PANTHENOL": "provitamine B5",
  "D-PANTHENOL": "provitamine B5",
  "TOCOPHEROL": "vitamine E",
  "TOCOPHERYL ACETATE": "vitamine E",
  "CAFFEINE": "caféine",
  "ALOE BARBADENSIS LEAF JUICE": "aloe vera",
  "ALOE BARBADENSIS LEAF EXTRACT": "aloe vera",

  // ── Parfum & arômes ──────────────────────────────────────────────────────
  "PARFUM": "parfum",
  "FRAGRANCE": "parfum",
  "AROMA": "arôme",
  "FLAVOR": "arôme",

  // ── Pigments / minéraux ──────────────────────────────────────────────────
  "TITANIUM DIOXIDE": "dioxyde de titane",
  "ZINC OXIDE": "oxyde de zinc",
  "IRON OXIDES": "oxydes de fer",
  "MICA": "mica",
  "CARBON BLACK": "noir de carbone",

  // ── Cires ────────────────────────────────────────────────────────────────
  "CERA ALBA": "cire d'abeille",
  "BEESWAX": "cire d'abeille",
  "COPERNICIA CERIFERA CERA": "cire de carnauba",
  "CARNAUBA WAX": "cire de carnauba",
  "EUPHORBIA CERIFERA CERA": "cire de candelilla",
  "CANDELILLA WAX": "cire de candelilla",

  // ── Argiles ──────────────────────────────────────────────────────────────
  "KAOLIN": "argile blanche",
  "BENTONITE": "argile bentonite",
  "ILLITE": "argile verte",
  "MONTMORILLONITE": "argile montmorillonite",

  // ── Dérivés sucrés / d'huile de coco couramment cités ────────────────────
  "COCO-CAPRYLATE/CAPRATE": "dérivé d'huile de coco",
  "COCO-CAPRYLATE": "dérivé d'huile de coco",
  "COCO-GLUCOSIDE": "dérivé sucré d'huile de coco",
  "DECYL GLUCOSIDE": "dérivé sucré (coco/maïs)",
  "LAURYL GLUCOSIDE": "dérivé sucré (coco/maïs)",

  // ── Eaux florales courantes ──────────────────────────────────────────────
  "ROSA DAMASCENA FLOWER WATER": "eau de rose",
  "HAMAMELIS VIRGINIANA WATER": "eau d'hamamélis",
  "CHAMOMILLA RECUTITA FLOWER WATER": "eau de camomille",

  // ── Soude / base de fabrication ──────────────────────────────────────────
  "SODIUM HYDROXIDE": "soude",
};

/**
 * Lookup helper. Returns the common French name for an INCI token, or
 * undefined if we don't have a "grand public" translation for it.
 *
 * The input MUST already be normalised through the same pipeline used by
 * `normaliseSynthesisToken` in AnalyseResultPanel.tsx (lowercase, no
 * diacritics, punctuation collapsed to single spaces).
 */
const NORMALISED: Map<string, string> = new Map(
  Object.entries(RAW).map(([k, v]) => [normaliseInciKey(k), v]),
);

function normaliseInciKey(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9+]+/g, " ")
    .trim();
}

export function commonNameFor(normalisedToken: string): string | undefined {
  return NORMALISED.get(normalisedToken);
}

/**
 * Same lookup as `commonNameFor` but accepts a raw INCI token (e.g. "AQUA",
 * "Persea Gratissima Oil") and runs the normalisation internally. Useful for
 * callers outside the synthesis renderer that just want "give me the grand-
 * public name if you have one".
 */
export function commonNameForRaw(raw: string): string | undefined {
  if (!raw) return undefined;
  return NORMALISED.get(normaliseInciKey(raw));
}

/**
 * Pretty-cases an INCI name for display inside the "(…)" suffix that
 * accompanies the common name. Goes from "PERSEA GRATISSIMA OIL" to
 * "Persea Gratissima Oil" - easier on the eye than ALLCAPS in body copy
 * but still recognisable as the on-label INCI token.
 */
export function prettyInci(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
