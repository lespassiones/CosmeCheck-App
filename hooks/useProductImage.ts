/**
 * useProductImage — URL d'image produit pour une analyse, résolue via le cache
 * 3 niveaux existant (lib/storage/productImageCache) :
 *   1. cache AsyncStorage instantané (getProductImage) ;
 *   2. lookup catalogue par EAN (source de vérité unique, resolveAndCacheProductImage) ;
 *   3. fallback fourni par l'appelant (ex : result_json.imageUrl pour les
 *      produits internet hors catalogue).
 *
 * Utilisé par les lignes de la routine matin/soir (photo produit 44x44) sans
 * dupliquer la logique de BigScoreCard.
 */

import { useEffect, useState } from 'react'

import { getProductImage, resolveAndCacheProductImage } from '@/lib/storage/productImageCache'

export function useProductImage(
  analysisId: string | null | undefined,
  ean: string | null | undefined,
  fallbackUrl?: string | null,
): string | null {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      if (!analysisId) return
      // 1. Cache local : affichage instantané.
      const cached = await getProductImage(analysisId)
      if (alive && cached) setUrl(cached)
      // 2. Résolution EAN (met à jour le cache et corrige un éventuel écart).
      const resolved = await resolveAndCacheProductImage(analysisId, ean ?? null, null, null)
      if (!alive) return
      if (resolved) {
        setUrl(resolved)
        return
      }
      // 3. Fallback appelant (produit hors catalogue avec image embarquée).
      if (!cached && fallbackUrl) setUrl(fallbackUrl)
    })().catch(() => {})
    return () => {
      alive = false
    }
    // fallbackUrl volontairement hors deps : c'est un secours statique, pas un
    // signal de re-résolution (évite les re-fetch sur identité d'objet).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisId, ean])

  return url
}
