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
import { useCallback } from 'react'
import { useRouter } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'

import { ROUTES } from '@/constants/routes'
import { useAnalysis } from '@/hooks/useAnalysis'
import { useAuth } from '@/hooks/useAuth'
import { useProfile } from '@/hooks/useProfile'
import { db } from '@/lib/supabase/client'
import type { AlternativeProduct } from '@/lib/analysis/alternativesFilter'
import type { AnalysisRow } from '@/lib/supabase/types'
import { ensureEanAnalysis } from '@/lib/analysis/eanAnalysisPrefetch'
import { cacheProductImage } from '@/lib/storage/productImageCache'
import { cacheAnalysisRow } from '@/lib/storage/session'

export function useLaunchAlternative(): {
  analyze: (product: AlternativeProduct) => Promise<void>
  isAnalyzing: boolean
} {
  const router = useRouter()
  const { user } = useAuth()
  const { restrictions } = useProfile()
  const { runAnalysis, isAnalyzing } = useAnalysis()
  const qc = useQueryClient()

  const analyze = useCallback(
    async (product: AlternativeProduct) => {
      const userId = user?.id
      const inci = product.ingredientsText?.trim()
      if (!userId || !inci || inci.length < 10) return

      // ── CHEMIN RAPIDE : analyse déjà cachée → insert direct + nav instantanée ──
      try {
        const cached = product.ean ? await ensureEanAnalysis(qc, product.ean) : null
        if (cached && Array.isArray(cached.items) && cached.items.length > 0) {
          const label = product.name?.slice(0, 200) ?? null
          const result_json = { ...cached, synthesis: null }
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
              score: Number(((cached.score as number) ?? 0).toFixed(2)),
              ean: product.ean ?? null,
            } as never)
            .select('*')
            .single()
          const row = inserted as AnalysisRow | null
          if (row?.id) {
            void cacheAnalysisRow(row).catch(() => {})
            if (product.imageUrl) void cacheProductImage(row.id, product.imageUrl).catch(() => {})
            router.push(ROUTES.ANALYSE.DETAIL(row.id))
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
        router.push(ROUTES.ANALYSE.DETAIL(result.analysisId))
      }
    },
    [user?.id, restrictions, runAnalysis, router, qc],
  )

  return { analyze, isAnalyzing }
}
