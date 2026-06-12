/**
 * Résout l'identité catalogue (EAN) d'un produit analysé à partir de sa
 * marque + son nom, via la RPC `cosme_check_search_catalog` (trigram indexé,
 * insensible casse/accents/ordre).
 *
 * La table `analyses` ne stocke pas l'EAN ni le slug de catégorie : pour
 * proposer des alternatives « même sous-catégorie », on retrouve d'abord le
 * produit dans le catalogue (même mécanisme que `resolveAndCacheProductImage`).
 *
 * Renvoie `null` si aucun match (produit saisi manuellement / trouvé sur
 * internet hors catalogue) → pas d'alternatives proposées.
 */
import { supabase } from '@/lib/supabase/client'

interface SearchRow {
  ean: string | null
  score: number | null
  category: string | null
}

export interface CatalogIdentity {
  ean: string
  /** Score INCI Beauty (catalog.score) — source de vérité, à afficher tel quel. */
  score: number | null
  /** Slug de catégorie complet (ex. "coiffure/shampooing/shampooing-classique"). */
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
      { p_query: query, p_limit: 1 } as never,
    )
    if (error) return null
    const rows = (data as SearchRow[] | null) ?? []
    const row = rows[0]
    if (!row?.ean) return null
    return {
      ean: row.ean,
      score: typeof row.score === 'number' ? row.score : null,
      category: row.category ?? null,
    }
  } catch {
    return null
  }
}
