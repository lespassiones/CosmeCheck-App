/**
 * Catégorie produit — type pur partagé.
 *
 * Côté web ce module contient aussi l'appel LLM `categorizeProduct`. Sur mobile
 * la catégorisation est faite par l'Edge Function `analyser` ; on n'a besoin
 * ici que de l'ENUM fermé `ProductCategory` (utilisé par `essentiel/engine.ts`
 * et `categoryLabel.ts`). On garde donc volontairement ce fichier sans aucune
 * dépendance React/Node — TS pur.
 *
 * Aligné byte-for-byte sur l'enum web `lib/ai/categorize.ts`.
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

export const PRODUCT_CATEGORIES: ProductCategory[] = [
  "creme_visage",
  "creme_corps",
  "shampooing",
  "apres_shampooing",
  "solaire",
  "maquillage",
  "nettoyant_visage",
  "deodorant",
  "parfum",
  "autre",
];

const VALID = new Set<ProductCategory>(PRODUCT_CATEGORIES);

export function isProductCategory(v: unknown): v is ProductCategory {
  return typeof v === "string" && VALID.has(v as ProductCategory);
}
