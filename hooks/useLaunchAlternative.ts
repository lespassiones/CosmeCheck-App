/**
 * useLaunchAlternative — lance une analyse à partir d'un produit recommandé puis
 * navigue vers sa fiche. Réutilise EXACTEMENT le chemin de la recherche
 * catalogue (`source: 'search'`, INCI déjà connu → l'Edge Function `analyser`
 * recalcule, garantissant un résultat identique à un scan classique).
 *
 * Utilisé par le carrousel d'alternatives (écran d'analyse) et la page
 * « Voir tout ». Expose `isAnalyzing` pour afficher un overlay pendant l'appel.
 */
import { useCallback } from 'react'
import { useRouter } from 'expo-router'

import { ROUTES } from '@/constants/routes'
import { useAnalysis } from '@/hooks/useAnalysis'
import { useAuth } from '@/hooks/useAuth'
import { useProfile } from '@/hooks/useProfile'
import type { AlternativeProduct } from '@/lib/analysis/alternativesFilter'
import { cacheProductImage } from '@/lib/storage/productImageCache'

export function useLaunchAlternative(): {
  analyze: (product: AlternativeProduct) => Promise<void>
  isAnalyzing: boolean
} {
  const router = useRouter()
  const { user } = useAuth()
  const { restrictions } = useProfile()
  const { runAnalysis, isAnalyzing } = useAnalysis()

  const analyze = useCallback(
    async (product: AlternativeProduct) => {
      const userId = user?.id
      const inci = product.ingredientsText?.trim()
      if (!userId || !inci || inci.length < 10) return
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
    [user?.id, restrictions, runAnalysis, router],
  )

  return { analyze, isAnalyzing }
}
