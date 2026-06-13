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
