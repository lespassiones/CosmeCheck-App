/**
 * Résout l'identité catalogue d'un produit analysé à partir de sa marque + son nom.
 *
 * Stratégie en un seul appel (search_catalog, top-10, indexé GIN, ~40ms) :
 *   - EAN      : le premier résultat (meilleur match trigram)
 *   - category : VOTE sur les 10 résultats → chemin format EXACT `catalog.category`
 *
 * Le vote est intentionnel : pour les produits internet absents du catalogue,
 * le top-1 peut être instable, mais si 8/10 résultats sont "coiffure/shampooing/..."
 * c'est la bonne catégorie. Même sans EAN trouvé, la catégorie votée est renvoyée
 * → les alternatives par exact-match fonctionnent pour les produits hors catalogue.
 */
import { supabase } from '@/lib/supabase/client'

interface SearchRow {
  ean: string | null
  score: number | null
  category: string | null
}

export interface CatalogIdentity {
  /** EAN du produit dans le catalogue. Null si le produit n'est pas au catalogue
   *  (ex. produit internet) mais que la catégorie a quand même pu être votée. */
  ean: string | null
  score: number | null
  /** Chemin de catégorie EXACT au format catalog.category
   *  (ex. "soins-corps/savon/savon-surgras"). Compatible avec
   *  cosme_check_alternatives_by_category_exact. */
  category: string | null
}

export async function resolveCatalogIdentity(
  brand: string | null | undefined,
  name: string | null | undefined,
): Promise<CatalogIdentity | null> {
  const query = [brand, name].filter(Boolean).join(' ').trim()
  if (query.length < 3) return null
  try {
    const { data, error } = await supabase.rpc(
      'cosme_check_search_catalog' as never,
      { p_query: query, p_limit: 10 } as never,
    )
    if (error) return null
    const rows = (data as SearchRow[] | null) ?? []
    if (rows.length === 0) return null

    const top = rows[0]

    // Vote catégorie sur les 10 résultats — plus robuste que top-1 seul.
    const catCounts = new Map<string, number>()
    for (const r of rows) {
      if (r.category) catCounts.set(r.category, (catCounts.get(r.category) ?? 0) + 1)
    }
    const votedCategory =
      [...catCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ??
      top.category ??
      null

    return {
      ean: top.ean ?? null,
      score: typeof top.score === 'number' ? top.score : null,
      category: votedCategory,
    }
  } catch {
    return null
  }
}
