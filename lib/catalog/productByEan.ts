/**
 * productByEan — lookup catalogue par EAN (PK), DÉDUPLIQUÉ via React Query.
 *
 * Plusieurs modules ont besoin de la même ligne catalogue au même moment
 * (ex. écran analyse : `resolveAndCacheProductImage` pour l'image ET
 * `resolveCatalogIdentity` pour score/catégorie). Chacun appelait la RPC
 * `cosme_check_get_product_by_ean` en direct → 2 à 4 appels identiques par
 * ouverture d'écran. `fetchQuery` sur une clé commune déduplique les appels
 * en vol et sert le résultat frais 5 min (même pattern que la recherche
 * catalogue, cf. lib/catalog/searchCache.ts).
 *
 * La clé 'productByEan' est BLACKLISTÉE du persister (queryPersist.ts) :
 * transient, ne doit pas gonfler le blob disque ni servir un score périmé.
 */
import { queryClient } from '@/lib/storage/queryClient'
import { supabase } from '@/lib/supabase/client'

export interface ProductByEanRow {
  ean: string | null
  score: number | null
  category: string | null
  image_url: string | null
  brand?: string | null
  name?: string | null
}

const STALE_MS = 5 * 60 * 1000

/**
 * Ligne catalogue pour un EAN, ou null si absent du catalogue.
 * Throw sur erreur RPC/réseau (les appelants gardent leur try/catch).
 */
export async function fetchProductByEan(ean: string): Promise<ProductByEanRow | null> {
  const key = ean.trim()
  if (!key) return null
  return queryClient.fetchQuery({
    queryKey: ['productByEan', key],
    staleTime: STALE_MS,
    gcTime: STALE_MS,
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        'cosme_check_get_product_by_ean' as never,
        { p_ean: key } as never,
      )
      if (error) throw error
      return ((data as ProductByEanRow[] | null) ?? [])[0] ?? null
    },
  })
}
