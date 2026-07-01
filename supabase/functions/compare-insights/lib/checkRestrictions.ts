/**
 * checkRestrictions — port Deno EXACT de mobile lib/restrictions/check.ts (lui-même
 * port du web). Détection DÉTERMINISTE des restrictions d'un produit, IDENTIQUE à
 * celle des fiches (famille par TAG, ingrédient par slug/nom). Utilisée par
 * compare-insights pour donner à l'IA la vérité terrain (au lieu de la laisser
 * deviner et affirmer à tort « aucun ingrédient interdit »).
 */

export interface UserRestrictions {
  families: string[];
  ingredients: { slug?: string | null; name: string }[];
}

export interface IngredientFamily {
  slug: string;
  tagSlug: string | null;
  name: string;
}

export interface CheckableItem {
  position: number;
  input?: string;
  slug?: string | null;
  name?: string | null;
  tags?: string[] | null;
}

export interface RestrictionMatch {
  kind: "family" | "ingredient";
  slug: string;
  label: string;
  position: number;
  inciName: string;
}

function normaliseInci(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

export function checkRestrictions(
  items: CheckableItem[],
  restrictions: UserRestrictions,
  families: IngredientFamily[],
): RestrictionMatch[] {
  if (!items || items.length === 0) return [];
  if (restrictions.families.length === 0 && restrictions.ingredients.length === 0) {
    return [];
  }

  const restrictedFamilySet = new Set(restrictions.families);
  const tagToFamily = new Map<string, IngredientFamily>();
  for (const fam of families) {
    if (!fam.tagSlug) continue;
    if (!restrictedFamilySet.has(fam.slug)) continue;
    tagToFamily.set(fam.tagSlug, fam);
  }

  const ingredientBySlug = new Map<string, string>();
  const ingredientByName = new Map<string, string>();
  for (const ing of restrictions.ingredients) {
    if (ing.slug) ingredientBySlug.set(ing.slug, ing.name);
    if (ing.name) ingredientByName.set(normaliseInci(ing.name), ing.name);
  }

  const matches: RestrictionMatch[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const inciName = (item.name ?? item.input ?? "").trim();
    const normalised = normaliseInci(inciName);

    if (item.tags && item.tags.length > 0) {
      for (const tag of item.tags) {
        const fam = tagToFamily.get(tag);
        if (!fam) continue;
        const key = `f:${fam.slug}:${item.position}`;
        if (seen.has(key)) continue;
        seen.add(key);
        matches.push({ kind: "family", slug: fam.slug, label: fam.name, position: item.position, inciName });
      }
    }

    const slugHit = item.slug ? ingredientBySlug.get(item.slug) : undefined;
    const nameHit = normalised ? ingredientByName.get(normalised) : undefined;
    const ingredientLabel = slugHit ?? nameHit;
    if (ingredientLabel) {
      const key = `i:${item.slug ?? normalised}:${item.position}`;
      if (!seen.has(key)) {
        seen.add(key);
        matches.push({
          kind: "ingredient",
          slug: item.slug ?? normalised,
          label: ingredientLabel,
          position: item.position,
          inciName,
        });
      }
    }
  }

  return matches.sort((a, b) => a.position - b.position);
}

/** Libellés dédupliqués (familles + ingrédients) détectés dans un produit. */
export function detectedLabels(matches: RestrictionMatch[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of matches) {
    if (seen.has(m.label)) continue;
    seen.add(m.label);
    out.push(m.label);
  }
  return out;
}
