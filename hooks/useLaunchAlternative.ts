/**
 * useLaunchAlternative — lance une analyse à partir d'un produit recommandé puis
 * navigue vers sa fiche.
 *
 * CHEMIN RAPIDE (produit déjà analysé, présent dans le cache EAN — ~90% des cas) :
 * on récupère l'analyse cachée (préchargée en lecture pendant que la personne lit),
 * on insère directement la ligne `analyses` (RLS « user inserts own analyses »),
 * on amorce le cache local et on navigue → fiche INSTANTANÉE, sans appel à l'Edge
 * ni débit de crédit.
 *
 * CHEMIN NORMAL (produit non caché) : analyse complète via l'Edge Function `analyser`
 * (`source: 'search'`), identique à un scan classique.
 */
import { useCallback, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { ROUTES } from '@/constants/routes'
import { useAnalysis } from '@/hooks/useAnalysis'
import { useAuth } from '@/hooks/useAuth'
import { useProfile } from '@/hooks/useProfile'
import { db } from '@/lib/supabase/client'
import type { AlternativeProduct } from '@/lib/analysis/alternativesFilter'
import type { AnalysisRow } from '@/lib/supabase/types'
import { ensureEanAnalysis } from '@/lib/analysis/eanAnalysisPrefetch'
import { useCappedPush } from '@/lib/navigation/useCappedPush'
import { alignCachedResult } from '@/lib/analysis/fastPathRow'
import { invalidateAnalysisLists } from '@/lib/analysis/invalidateLists'
import { cacheProductImage } from '@/lib/storage/productImageCache'
import { cacheAnalysisRow } from '@/lib/storage/session'

export function useLaunchAlternative(): {
  analyze: (product: AlternativeProduct) => Promise<void>
  isAnalyzing: boolean
} {
  const { user } = useAuth()
  const { restrictions } = useProfile()
  const { runAnalysis, isAnalyzing } = useAnalysis()
  const qc = useQueryClient()
  // Fiche → alternative → fiche… : pile plafonnée (lib/navigation/stackCap).
  const cappedPush = useCappedPush()
  // Verrou anti double tap : le chemin rapide ne passe pas par `isAnalyzing`,
  // deux taps rapprochés inséraient deux analyses et empilaient deux fiches.
  const launching = useRef(false)

  const launch = useCallback(
    async (product: AlternativeProduct, userId: string, inci: string) => {
      // ── CHEMIN RAPIDE : analyse déjà cachée → insert direct + nav instantanée ──
      try {
        const cached = product.ean ? await ensureEanAnalysis(qc, product.ean) : null
        if (cached && Array.isArray(cached.items) && cached.items.length > 0) {
          const label = product.name?.slice(0, 200) ?? null
          // Note = note catalogue actuelle (renvoyée par la RPC), sinon celle de
          // la carte ; jamais 0 inventé (cf. lib/analysis/fastPathRow.ts).
          const aligned = alignCachedResult(cached, product.score)
          const result_json = aligned.resultJson
          const { data: inserted } = await db()
            .from('analyses' as never)
            .insert({
              user_id: userId,
              name: label ?? 'Analyse',
              product_label: label,
              brand: product.brand?.slice(0, 120) ?? null,
              category: (cached.category as string | null) ?? null,
              input_text: inci,
              result_json,
              score: aligned.score,
              ean: product.ean ?? null,
            } as never)
            .select('*')
            .single()
          const row = inserted as AnalysisRow | null
          if (row?.id) {
            void cacheAnalysisRow(row).catch(() => {})
            // Nouvelle analyse insérée ici sans passer par useAnalysis.
            invalidateAnalysisLists(qc)
            if (product.imageUrl) void cacheProductImage(row.id, product.imageUrl).catch(() => {})
            cappedPush(ROUTES.ANALYSE.DETAIL(row.id))
            return
          }
        }
      } catch {
        // Toute erreur → on retombe sur le chemin normal (jamais bloquant).
      }

      // ── CHEMIN NORMAL : analyse complète via l'Edge ──
      const result = await runAnalysis({
        inciInput: inci,
        source: 'search',
        userId,
        userRestrictions: restrictions,
        productName: product.name ?? undefined,
        brand: product.brand ?? undefined,
        barcode: product.ean,
      })
      if (result) {
        if (product.imageUrl) {
          void cacheProductImage(result.analysisId, product.imageUrl).catch(() => {})
        }
        cappedPush(ROUTES.ANALYSE.DETAIL(result.analysisId))
      }
    },
    [restrictions, runAnalysis, cappedPush, qc],
  )


  const analyze = useCallback(
    async (product: AlternativeProduct) => {
      const userId = user?.id
      const inci = product.ingredientsText?.trim()
      if (!userId || !inci || inci.length < 10) return
      if (launching.current) return
      launching.current = true
      try {
        await launch(product, userId, inci)
      } finally {
        launching.current = false
      }
    },
    [user?.id, launch],
  )

  return { analyze, isAnalyzing }
}
