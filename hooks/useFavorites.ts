/**
 * useFavorites — liste des analyses marquées « favori » de l'utilisateur.
 *
 * Alimente la carte « Mes favoris » (onglet routine, compte seul) et la page
 * dédiée /routine/favoris (liste complète). Les favoris viennent de deux
 * sources, toutes deux via la colonne `analyses.favori` :
 *   - historique (icône signet) ;
 *   - « Garder en favori » dans le deck de suggestions (useKeepFavorite).
 *
 * Modèle de vue épuré pour RoutineProductCard (image résolue par la carte via
 * useProductImage → pas de batch catalog ici). staleTime 60 s, invalidé par
 * ['favorites'] quand un favori bascule.
 */

import { useQuery } from '@tanstack/react-query'

import { db } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { decodeHtml } from '@/lib/decodeHtml'
import { parseAnalyseResponse, type AnalyseResponse } from '@/lib/analysis/types'
import type { BlobCounts } from '@/components/design/IngredientBlob'

export interface FavoriteItem {
  /** id de l'analyse (navigation /analyse/[id] + résolution image). */
  id: string
  name: string
  brand: string | null
  ean: string | null
  counts: BlobCounts | null
  fallbackImageUrl: string | null
}

interface FavoriRow {
  id: string
  name: string | null
  product_label: string | null
  brand: string | null
  ean: string | null
  result_json: unknown
  created_at: string
}

function toFavorite(row: FavoriRow): FavoriteItem {
  const parsed = row.result_json
    ? (parseAnalyseResponse(row.result_json) as AnalyseResponse | null)
    : null
  const c = parsed?.counts
  const counts: BlobCounts | null = c
    ? { vert: c.vert, jaune: c.jaune, orange: c.orange, rouge: c.rouge }
    : null
  const fallbackImageUrl =
    row.result_json && typeof row.result_json === 'object'
      ? ((row.result_json as { imageUrl?: string }).imageUrl ?? null)
      : null
  return {
    id: row.id,
    name: decodeHtml(row.product_label?.trim() || row.name?.trim()) || 'Produit',
    brand: decodeHtml(row.brand?.trim()) || null,
    ean: row.ean?.trim() || null,
    counts,
    fallbackImageUrl,
  }
}

export function useFavorites(): {
  favorites: FavoriteItem[]
  count: number
  isLoading: boolean
} {
  const { user } = useAuth()
  const userId = user?.id ?? null

  const { data = [], isLoading } = useQuery<FavoriteItem[]>({
    queryKey: ['favorites', userId],
    enabled: Boolean(userId),
    staleTime: 60 * 1000,
    queryFn: async () => {
      if (!userId) return []
      const { data: rows, error } = await db()
        .from('analyses')
        .select('id,name,product_label,brand,ean,result_json,created_at')
        .eq('user_id', userId)
        .eq('favori', true)
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      return ((rows as FavoriRow[] | null) ?? []).map(toFavorite)
    },
  })

  return { favorites: data, count: data.length, isLoading }
}
