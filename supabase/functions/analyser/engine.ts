/**
 * Helpers déterministes partagés avec le moteur "essentiel" du web
 * (`CosmetWiki/lib/essentiel/engine.ts`) : la table de catégories produit et
 * l'ensemble des tags neutres/positifs. Extraits ici pour que l'Edge Function
 * filtre les observations EXACTEMENT comme le web.
 */

export type ProductCategory =
  | "creme_visage"
  | "creme_corps"
  | "shampooing"
  | "apres_shampooing"
  | "solaire"
  | "maquillage"
  | "nettoyant_visage"
  | "deodorant"
  | "parfum"
  | "autre";

/** Tags qu'on NE veut PAS surfacer comme "ce qui ne va pas" (positifs/neutres). */
export const NEUTRAL_OR_POSITIVE_TAGS: ReadonlySet<string> = new Set([
  "huile-vegetale",
  "colorant-naturel",
  "filtre-uv-mineral",
  "colorant-mineral",
]);

// ORDER MATTERS: testé de haut en bas, le premier hit gagne.
const PRODUCT_TYPE_PATTERNS: Array<{ category: ProductCategory; keywords: string[] }> = [
  { category: "deodorant", keywords: ["deodorant", "déodorant", "anti-perspirant", "antitranspirant", "anti-transpirant"] },
  { category: "apres_shampooing", keywords: ["apres-shampooing", "après-shampooing", "apres shampoing", "après shampoing", "conditioner", "soin capillaire", "masque capillaire", "masque cheveux", "huile capillaire", "soin cheveux"] },
  { category: "shampooing", keywords: ["shampooing", "shampoing", "shampoo", "shampoing sec", "antipelliculaire"] },
  { category: "solaire", keywords: ["solaire", "creme solaire", "crème solaire", "ecran solaire", "écran solaire", "spf", "sunscreen", "after-sun", "apres-soleil", "après-soleil"] },
  { category: "nettoyant_visage", keywords: ["nettoyant visage", "gel nettoyant", "mousse nettoyante", "demaquillant", "démaquillant", "eau micellaire", "cleanser"] },
  { category: "creme_visage", keywords: ["creme visage", "crème visage", "soin visage", "serum visage", "sérum visage", "serum", "sérum", "contour des yeux", "contour yeux", "creme de jour", "crème de jour", "creme de nuit", "crème de nuit", "anti-age", "anti-âge", "anti-rides", "anti-ride", "creme hydratante", "crème hydratante"] },
  { category: "creme_corps", keywords: ["creme corps", "crème corps", "lait corps", "baume corps", "huile corps", "soin corps", "gel douche", "savon", "huile de douche", "lait hydratant", "beurre corporel", "body lotion", "body cream"] },
  { category: "maquillage", keywords: ["fond de teint", "rouge a levres", "rouge à lèvres", "mascara", "fard", "blush", "eyeliner", "anticerne", "anti-cerne", "vernis a ongles", "vernis à ongles", "vernis", "poudre"] },
  { category: "parfum", keywords: ["parfum", "eau de toilette", "eau de parfum", "eau de cologne", "edt", "edp", "fragrance"] },
];

const DIACRITICS_RE = new RegExp("[\\u0300-\\u036f]", "g");

function deburr(s: string): string {
  return s.normalize("NFD").replace(DIACRITICS_RE, "").toLowerCase().trim();
}

export function normalizeProductTypeToCategory(
  productType: string | null | undefined,
): ProductCategory | null {
  if (!productType) return null;
  const needle = deburr(productType);
  if (!needle) return null;
  for (const { category, keywords } of PRODUCT_TYPE_PATTERNS) {
    for (const kw of keywords) {
      if (needle.includes(deburr(kw))) return category;
    }
  }
  return null;
}

/** Marqueurs capillaires NON ambigus dans un nom de produit. */
const HAIR_NAME_MARKERS: string[] = [
  "capillaire", "cheveux", "shampoing", "shampooing", "shampoo", "conditioner",
  "cuir chevelu", "scalp", "demelant", "antipelliculaire", "anti-pelliculaire",
  "pellicules", "coiffant", "coiffage", "revitalisant",
];

/** Catégories « peau » : incompatibles avec un produit manifestement capillaire.
 *  `parfum` en est VOLONTAIREMENT absent : une brume parfumée reste un parfum,
 *  la ranger en soin capillaire serait une erreur symétrique. */
const SKIN_CATEGORIES: ReadonlySet<ProductCategory> = new Set<ProductCategory>([
  "creme_visage", "creme_corps", "nettoyant_visage", "solaire", "maquillage",
]);

/** Marqueurs corps/visage. Un produit qui en porte EN MÊME TEMPS qu'un marqueur
 *  capillaire est multi-zone (« Brume Corps & Cheveux », « crème 3 en 1 ») : le
 *  forcer en capillaire serait aussi faux que le laisser en peau. */
const MULTI_ZONE_MARKERS: string[] = [
  "corps", "visage", "mains", "pieds", "3 en 1", "3en1", "2 en 1", "2en1",
  "multi-usage", "multiusage", "universel",
];

export function hasHairMarker(text: string | null | undefined): boolean {
  if (!text) return false;
  const needle = deburr(text);
  return HAIR_NAME_MARKERS.some((m) => needle.includes(deburr(m)));
}

function isMultiZone(text: string | null | undefined): boolean {
  if (!text) return false;
  const needle = deburr(text);
  return MULTI_ZONE_MARKERS.some((m) => needle.includes(deburr(m)));
}

/**
 * Garde-fou de catégorie CAPILLAIRE (incident 21 août 2026).
 *
 * Hors catalogue, la catégorie vient de la course LLM 1,5 s (ou du mappage
 * `productType`), sans aucun filet déterministe : « Crème Capillaire Koni » est
 * repartie en `creme_corps`. Or `personal-insights/relevance.ts` déduit l'AXE du
 * profil (peau vs cheveux) de cette catégorie via `categoryToAxis` → le LLM a
 * reçu « produit peau » et a écrit « adoucir ta peau du corps » pour un soin
 * cheveux, en appliquant en plus les malus peau (huile de coco vs peau grasse).
 *
 * Règle : un nom qui porte un marqueur capillaire non ambigu ne peut PAS être
 * rangé en catégorie peau. On ne touche jamais un slug catalogue (curation =
 * source de vérité), uniquement la catégorie déduite.
 */
export function guardHairCategory(
  category: ProductCategory | null,
  productName: string | null | undefined,
): ProductCategory | null {
  if (!hasHairMarker(productName)) return category;
  // Produit multi-zone (corps ET cheveux) : on ne tranche pas, on laisse tel quel.
  if (isMultiZone(productName)) return category;
  if (category !== null && !SKIN_CATEGORIES.has(category)) return category;
  const needle = deburr(productName ?? "");
  // « après-shampooing » avant « shampooing » : le second est sous-chaîne du premier.
  if (/(apres)[ -]?shampo/.test(needle) || needle.includes("conditioner")) {
    return "apres_shampooing";
  }
  if (needle.includes("shampo")) return "shampooing";
  // Autres soins cheveux (crème/masque/huile capillaire) : `apres_shampooing` est
  // le seau capillaire non-lavant de cette taxonomie (cf. PRODUCT_TYPE_PATTERNS).
  return "apres_shampooing";
}
