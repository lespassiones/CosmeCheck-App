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

/**
 * Marqueurs capillaires NON ambigus dans un nom de produit, cherchés comme
 * SOUS-CHAÎNES (après normalisation casse + accents) : « capillaire » couvre
 * « capillaires », « cheveu » couvre « cheveux ».
 *
 * Extension (bêta 28 sept 2026, « il analyse une crème cheveux comme si c'était
 * pour le visage ») : la liste initiale ratait les soins sans rinçage, les
 * cheveux bouclés/crépus, le co-wash, les défrisants, etc.
 */
export const HAIR_NAME_MARKERS: readonly string[] = [
  "capillaire", "cheveu", "shampoing", "shampooing", "shampoo", "conditioner",
  "cuir chevelu", "scalp", "demelant", "antipelliculaire", "anti-pelliculaire",
  "pellicules", "coiffant", "coiffage", "revitalisant",
  // Extension sept 2026.
  "apres-shampo", "apres shampo", "leave-in", "leave in", "co-wash", "cowash",
  "soin sans rincage", "defrisant", "anti-chute", "antichute", "anti chute",
  "thermo-protecteur", "thermoprotecteur", "thermo protecteur",
];

/**
 * Marqueurs capillaires cherchés comme MOTS ENTIERS (trop courts ou trop
 * génériques pour une recherche par sous-chaîne : « hair » est dans « chair »).
 * « curl » seul est volontairement ABSENT : il désigne aussi des mascaras
 * (« curl mascara »), seuls « curly » et « curls » sont non ambigus.
 */
export const HAIR_NAME_WORDS: readonly string[] = [
  "hair", "curly", "curls", "boucles", "crepus", "crepues", "frises", "frisees",
  "pointes", "longueurs",
];

/** Maquillage des yeux : un nom qui en parle n'est JAMAIS un produit capillaire
 *  (« mascara boucles », « sérum cils et sourcils »). */
const EYE_MAKEUP_RE = /\b(mascara|cils|sourcils|lash|lashes|eyeliner|eye liner)\b/;

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
  // Extension sept 2026 : variantes à tirets et anglaises. « body » SEUL est
  // volontairement absent (marque « The Body Shop » : ses shampooings resteraient
  // sinon bloqués en catégorie peau) ; seules les paires explicites comptent.
  "2-en-1", "3-en-1", "2-in-1", "3-in-1", "2 in 1", "3 in 1",
  "hair & body", "hair and body", "body & hair", "body and hair", "hair body",
  "tete aux pieds",
];

/** Découpe en mots (lettres/chiffres) après normalisation casse + accents. */
function wordsOf(text: string): Set<string> {
  return new Set(deburr(text).split(/[^a-z0-9]+/).filter(Boolean));
}

export function hasHairMarker(text: string | null | undefined): boolean {
  if (!text) return false;
  const needle = deburr(text);
  if (EYE_MAKEUP_RE.test(needle)) return false;
  if (HAIR_NAME_MARKERS.some((m) => needle.includes(deburr(m)))) return true;
  const words = wordsOf(text);
  return HAIR_NAME_WORDS.some((w) => words.has(w));
}

/** Nom qui porte à la fois une zone capillaire et une zone peau (corps, visage…). */
export function isMultiZoneName(text: string | null | undefined): boolean {
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
  if (isMultiZoneName(productName)) return category;
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
