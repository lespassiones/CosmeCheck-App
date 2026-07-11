/**
 * checkRestrictions — matcher de restrictions PUR, port mobile EXACT du web
 * (CosmetWiki/lib/restrictions/check.ts). Garantit que mobile et web détectent
 * EXACTEMENT les mêmes familles restreintes dans un produit donné.
 *
 * Matching famille : par TAG (item.tags[] → ingredient_families.tag_slug). C'est
 * la même stratégie que le backend analyser (personalization.ts). On NE se base
 * PLUS sur les noms-membres résolus par RPC (ancienne heuristique mobile qui
 * divergeait du web et affichait les mauvaises familles).
 *
 * Matching ingrédient : par slug puis par nom INCI normalisé.
 */
import type { UserRestrictions } from '@/lib/supabase/types'

/** Une famille du référentiel `cosme_check.ingredient_families`. */
export interface IngredientFamily {
  slug: string
  tagSlug: string | null
  name: string
}

export interface CheckableItem {
  position: number
  input?: string
  slug?: string | null
  name?: string | null
  tags?: string[] | null
}

export interface RestrictionMatch {
  kind: 'family' | 'ingredient'
  slug: string
  label: string
  position: number
  inciName: string
}

/** Minuscule, trim, espaces compactés. Les noms INCI sont insensibles à la casse. */
function normaliseInci(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
}

export function checkRestrictions(
  items: CheckableItem[],
  restrictions: UserRestrictions,
  families: IngredientFamily[],
): RestrictionMatch[] {
  if (!items || items.length === 0) return []
  if (restrictions.families.length === 0 && restrictions.ingredients.length === 0) {
    return []
  }

  // Table tag → famille, pour les familles restreintes uniquement.
  const restrictedFamilySet = new Set(restrictions.families)
  const tagToFamily = new Map<string, IngredientFamily>()
  for (const fam of families) {
    if (!fam.tagSlug) continue
    if (!restrictedFamilySet.has(fam.slug)) continue
    tagToFamily.set(fam.tagSlug, fam)
  }

  // Ingrédients restreints : par slug et par nom normalisé.
  const ingredientBySlug = new Map<string, string>()
  const ingredientByName = new Map<string, string>()
  for (const ing of restrictions.ingredients) {
    if (ing.slug) ingredientBySlug.set(ing.slug, ing.name)
    if (ing.name) ingredientByName.set(normaliseInci(ing.name), ing.name)
  }

  const matches: RestrictionMatch[] = []
  const seen = new Set<string>()

  for (const item of items) {
    const inciName = (item.name ?? item.input ?? '').trim()
    const normalised = normaliseInci(inciName)

    // Famille : un des tags de l'item correspond à une famille restreinte.
    if (Array.isArray(item.tags) && item.tags.length > 0) {
      for (const tag of item.tags) {
        const fam = tagToFamily.get(tag)
        if (!fam) continue
        const key = `f:${fam.slug}:${item.position}`
        if (seen.has(key)) continue
        seen.add(key)
        matches.push({
          kind: 'family',
          slug: fam.slug,
          label: fam.name,
          position: item.position,
          inciName,
        })
      }
    }

    // Ingrédient : par slug puis par nom INCI normalisé.
    const slugHit = item.slug ? ingredientBySlug.get(item.slug) : undefined
    const nameHit = normalised ? ingredientByName.get(normalised) : undefined
    const ingredientLabel = slugHit ?? nameHit
    if (ingredientLabel) {
      const key = `i:${item.slug ?? normalised}:${item.position}`
      if (!seen.has(key)) {
        seen.add(key)
        matches.push({
          kind: 'ingredient',
          slug: item.slug ?? normalised,
          label: ingredientLabel,
          position: item.position,
          inciName,
        })
      }
    }
  }

  return matches.sort((a, b) => a.position - b.position)
}
