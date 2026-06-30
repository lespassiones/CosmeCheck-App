/**
 * Résolution famille de restriction → noms INCI membres, via la RPC
 * `cosme_check_get_family_ingredient_names`.
 *
 * Utilisé pour étendre les familles évitées par l'utilisateur (ex. « silicones »)
 * vers leurs ingrédients réels (Dimethicone, Cyclopentasiloxane…), afin de
 * pouvoir les détecter dans une liste INCI. Partagé entre :
 *   - le filtrage des recommandations (useAlternatives),
 *   - le marquage `is_restricted` de l'analyse (applyRestrictions).
 */
import { supabase } from '@/lib/supabase/client'

export async function fetchFamilyIngredientNames(slugs: string[]): Promise<string[]> {
  if (slugs.length === 0) return []
  const { data, error } = await supabase.rpc(
    'cosme_check_get_family_ingredient_names' as never,
    { p_family_slugs: slugs } as never,
  )
  if (error) throw error
  return ((data as { name: string | null }[] | null) ?? [])
    .map((r) => r.name)
    .filter((n): n is string => !!n)
}

/** Map family_slug → Set of ingredient names for that family. */
export async function fetchFamilyIngredientsBySlug(
  slugs: string[],
): Promise<Map<string, Set<string>>> {
  if (slugs.length === 0) return new Map()
  try {
    // Try RPC first if it exists, fallback to empty map
    const { data } = await supabase.rpc(
      'cosme_check_get_family_ingredients_by_slug' as never,
      { p_family_slugs: slugs } as never,
    )

    const result = new Map<string, Set<string>>()
    if (data && Array.isArray(data)) {
      for (const row of data as { family_slug: string; name: string }[]) {
        if (!row.family_slug || !row.name) continue
        if (!result.has(row.family_slug)) {
          result.set(row.family_slug, new Set())
        }
        result.get(row.family_slug)!.add(row.name.toLowerCase())
      }
    }
    return result
  } catch {
    return new Map()
  }
}
