/**
 * Préchargement (LECTURE SEULE) de l'analyse cachée d'un produit, par EAN.
 *
 * But : rendre le clic sur un produit recommandé INSTANTANÉ. Pendant que la
 * personne lit la réponse du Beauty Advisor, on précharge en arrière-plan
 * l'analyse déjà calculée des produits visibles via la RPC `cosme_check_get_product_analysis`
 * (lecture seule : 0 écriture, 0 crédit, 0 IA → safe à grande échelle). Au clic,
 * `useLaunchAlternative` insère la ligne d'analyse à partir de ce cache et navigue
 * sans attendre l'Edge.
 *
 * Cache via React Query (clé ['eanAnalysis', ean]) : un produit préchargé n'est
 * jamais re-fetché tant qu'il est frais.
 */
import type { QueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'

/** result_json d'une analyse (forme souple : on ne lit que items/score/category). */
export type CachedAnalysisJson = Record<string, unknown> & {
  items?: unknown[]
  score?: number
  category?: string | null
}

const STALE_MS = 30 * 60 * 1000
const eanKey = (ean: string) => ['eanAnalysis', ean] as const

async function fetchEanAnalysis(ean: string): Promise<CachedAnalysisJson | null> {
  const { data, error } = await supabase.rpc(
    'cosme_check_get_product_analysis' as never,
    { p_ean: ean } as never,
  )
  if (error || !data) return null
  return data as CachedAnalysisJson
}

/** Précharge (en lecture) l'analyse cachée d'un EAN. Best-effort, ne throw jamais. */
export async function prefetchEanAnalysis(qc: QueryClient, ean?: string | null): Promise<void> {
  if (!ean) return
  try {
    await qc.prefetchQuery({
      queryKey: eanKey(ean),
      staleTime: STALE_MS,
      queryFn: () => fetchEanAnalysis(ean),
    })
  } catch {
    // silencieux : le préchargement ne doit jamais casser l'UI.
  }
}

/** Précharge en parallèle les premiers produits visibles (cap pour la bande passante). */
export function prefetchProductsAnalyses(
  qc: QueryClient,
  eans: (string | null | undefined)[],
  max = 6,
): void {
  const unique = [...new Set(eans.filter((e): e is string => !!e))].slice(0, max)
  for (const ean of unique) void prefetchEanAnalysis(qc, ean)
}

/** Lit l'analyse préchargée (sans déclencher de fetch). null si non préchargée. */
export function getPrefetchedEanAnalysis(
  qc: QueryClient,
  ean?: string | null,
): CachedAnalysisJson | null {
  if (!ean) return null
  return (qc.getQueryData(eanKey(ean)) as CachedAnalysisJson | null) ?? null
}

/**
 * Récupère l'analyse cachée d'un EAN : préchargée si dispo (instantané), sinon
 * fetch immédiat (toujours en lecture seule). null si le produit n'est pas en cache.
 */
export async function ensureEanAnalysis(
  qc: QueryClient,
  ean?: string | null,
): Promise<CachedAnalysisJson | null> {
  if (!ean) return null
  const cached = getPrefetchedEanAnalysis(qc, ean)
  if (cached) return cached
  try {
    return await qc.fetchQuery({
      queryKey: eanKey(ean),
      staleTime: STALE_MS,
      queryFn: () => fetchEanAnalysis(ean),
    })
  } catch {
    return null
  }
}
