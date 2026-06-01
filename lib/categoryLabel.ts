import type { ProductCategory } from "@/lib/ai/categorize";
export type { ProductCategory } from "@/lib/ai/categorize";

const LABELS: Record<ProductCategory, string | null> = {
  creme_visage: "Crème visage",
  creme_corps: "Crème corps",
  shampooing: "Shampoing",
  apres_shampooing: "Après-shampoing",
  solaire: "Solaire",
  maquillage: "Maquillage",
  nettoyant_visage: "Nettoyant visage",
  deodorant: "Déodorant",
  parfum: "Parfum",
  autre: null,
};

export function categoryLabel(cat: ProductCategory | null | undefined): string | null {
  if (!cat) return null;
  return LABELS[cat] ?? null;
}
