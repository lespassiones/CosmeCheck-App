/**
 * Statistiques de score d'une (sous-)catégorie catalogue — moyenne + nombre de
 * produits notés. Alimente la comparaison « produits similaires » de l'écran
 * « Comment cette note est calculée ? ». RPC trigram-indexée, cachée 1 h
 * (la moyenne d'une catégorie bouge très lentement).
 */
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'

export interface CategoryScoreStats {
  avgScore: number | null
  productCount: number
}

export function useCategoryScoreStats(category: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['categoryScoreStats', category],
    enabled: enabled && !!category,
    staleTime: 60 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    queryFn: async (): Promise<CategoryScoreStats> => {
      const { data, error } = await supabase.rpc(
        'cosme_check_category_score_stats' as never,
        { p_category: category } as never,
      )
      if (error) throw error
      const row = (data as Array<{ avg_score: number | null; product_count: number }> | null)?.[0]
      return {
        avgScore: typeof row?.avg_score === 'number' ? row.avg_score : null,
        productCount: row?.product_count ?? 0,
      }
    },
  })
}
