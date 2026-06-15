/**
 * useKeepFavorite — « Garder en favori » une alternative proposée : on l'analyse
 * (fast-path cache EAN si dispo, sinon Edge), on l'ajoute à l'historique de
 * l'utilisateur en FAVORI, SANS naviguer. Renvoie true si OK (pour le toast).
 *
 * Jumeau de useLaunchAlternative mais : favori=true + pas de navigation.
 */
import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { useAnalysis } from '@/hooks/useAnalysis'
import { useAuth } from '@/hooks/useAuth'
import { useProfile } from '@/hooks/useProfile'
import { db } from '@/lib/supabase/client'
import type { AlternativeProduct } from '@/lib/analysis/alternativesFilter'
import type { AnalysisRow } from '@/lib/supabase/types'
import { ensureEanAnalysis } from '@/lib/analysis/eanAnalysisPrefetch'
import { cacheProductImage } from '@/lib/storage/productImageCache'
import { cacheAnalysisRow } from '@/lib/storage/session'

export function useKeepFavorite(): {
  keep: (product: AlternativeProduct) => Promise<boolean>
  ensureAnalysisId: (product: AlternativeProduct) => Promise<string | null>
} {
  const { user } = useAuth()
  const { restrictions } = useProfile()
  const { runAnalysis } = useAnalysis()
  const qc = useQueryClient()

  /**
   * Insère (ou crée via Edge) l'analyse de l'alternative dans l'historique de
   * l'utilisateur et renvoie son id. `favori` → marque favori. Fast-path cache EAN.
   */
  const ensure = useCallback(
    async (product: AlternativeProduct, favori: boolean): Promise<string | null> => {
      const userId = user?.id
      const inci = product.ingredientsText?.trim()
      if (!userId || !inci || inci.length < 10) return null

      // ── Fast-path : analyse déjà cachée (EAN) → insert direct ──
      try {
        const cached = product.ean ? await ensureEanAnalysis(qc, product.ean) : null
        if (cached && Array.isArray(cached.items) && cached.items.length > 0) {
          const label = product.name?.slice(0, 200) ?? null
          const { data: inserted } = await db()
            .from('analyses' as never)
            .insert({
              user_id: userId,
              name: label ?? 'Analyse',
              product_label: label,
              brand: product.brand?.slice(0, 120) ?? null,
              category: (cached.category as string | null) ?? null,
              input_text: inci,
              result_json: { ...cached, synthesis: null },
              score: Number(((cached.score as number) ?? 0).toFixed(2)),
              ean: product.ean ?? null,
              favori,
            } as never)
            .select('*')
            .single()
          const row = inserted as AnalysisRow | null
          if (row?.id) {
            void cacheAnalysisRow(row).catch(() => {})
            if (product.imageUrl) void cacheProductImage(row.id, product.imageUrl).catch(() => {})
            void qc.invalidateQueries({ queryKey: ['history'] })
            return row.id
          }
        }
      } catch {
        // → chemin normal
      }

      // ── Chemin normal : analyse complète via l'Edge ──
      const result = await runAnalysis({
        inciInput: inci,
        source: 'search',
        userId,
        userRestrictions: restrictions,
        productName: product.name ?? undefined,
        brand: product.brand ?? undefined,
        barcode: product.ean,
      })
      if (result?.analysisId) {
        if (favori) await db().from('analyses').update({ favori: true }).eq('id', result.analysisId)
        if (product.imageUrl) {
          void cacheProductImage(result.analysisId, product.imageUrl).catch(() => {})
        }
        void qc.invalidateQueries({ queryKey: ['history'] })
        return result.analysisId
      }
      return null
    },
    [user?.id, restrictions, runAnalysis, qc],
  )

  const keep = useCallback(
    async (product: AlternativeProduct) => (await ensure(product, true)) !== null,
    [ensure],
  )
  const ensureAnalysisId = useCallback(
    (product: AlternativeProduct) => ensure(product, false),
    [ensure],
  )

  return { keep, ensureAnalysisId }
}
