/**
 * buildSuggestions — pour chaque produit « à optimiser », trouve la MEILLEURE
 * alternative du catalogue (même sous-catégorie précise, respecte les
 * restrictions, score plafonné strictement meilleur). Retire le produit s'il
 * n'a aucune alternative valable.
 *
 * Récupération par MATCH EXACT du chemin de catégorie (RPC
 * cosme_check_alternatives_by_category_exact) -> pas de débordement entre
 * sous-catégories. + filtre restrictions + plafond couleur (count_orange/rouge).
 * La catégorie passée est le chemin précis résolu en amont (EAN -> catalog, sinon
 * classification kNN), cf. app/(tabs)/routine.tsx openSuggestions.
 */
import { supabase } from '@/lib/supabase/client'
import { applyColorCap } from '@/lib/analysis/scoreCap'
import {
  filterAlternatives,
  type AlternativeProduct,
  type ExclusionSet,
} from '@/lib/analysis/alternativesFilter'
import type { OptimizeCandidate, OptimizeInfo } from './optimize'

interface AltRpcRow {
  ean: string
  brand: string | null
  name: string | null
  image_url: string | null
  score: number | null
  score_label: string | null
  score_tone: string | null
  count_total: number | null
  ingredients_text: string | null
  count_orange: number | null
  count_rouge: number | null
}

function mapRow(r: AltRpcRow): AlternativeProduct {
  return {
    ean: r.ean,
    brand: r.brand,
    name: r.name,
    imageUrl: r.image_url,
    score: r.score,
    scoreLabel: r.score_label,
    scoreTone: r.score_tone,
    countTotal: r.count_total,
    ingredientsText: r.ingredients_text,
    countOrange: r.count_orange ?? 0,
    countRouge: r.count_rouge ?? 0,
  }
}

/** Score plafonné (blocus orange/rouge) d'un candidat. */
export function cappedOf(p: AlternativeProduct): number {
  return applyColorCap(p.score ?? 0, p.countOrange, p.countRouge)
}

export interface Suggestion<T> {
  product: T
  info: OptimizeInfo
  alternative: AlternativeProduct
}

/**
 * `getCategory` = catégorie précise (slug) ou libellé du produit ; `getEan` =
 * son EAN (pour ne pas se proposer lui-même). `exclusion` = restrictions du
 * profil (déjà résolues). Concurrence bornée par Promise.all (≤ 5 produits).
 */
export async function buildSuggestions<T>(
  candidates: OptimizeCandidate<T>[],
  getCategory: (p: T) => string | null,
  getEan: (p: T) => string | null,
  exclusion: ExclusionSet,
): Promise<Suggestion<T>[]> {
  const results = await Promise.all(
    candidates.map(async (c): Promise<Suggestion<T> | null> => {
      const category = getCategory(c.product)
      if (!category || category.trim().length < 3) return null
      try {
        const { data, error } = await supabase.rpc(
          'cosme_check_alternatives_by_category_exact' as never,
          { p_category: category, p_limit: 30, p_offset: 0 } as never,
        )
        if (error) return null
        let alts = ((data as AltRpcRow[] | null) ?? []).map(mapRow)
        const ownEan = getEan(c.product)
        if (ownEan) alts = alts.filter((a) => a.ean !== ownEan)
        // respecte les restrictions du profil
        alts = filterAlternatives(alts, exclusion)
        // strictement meilleur (plafonné) ET dans la zone verte (≥ 13 = "Bien")
        const own = c.info.cappedScore ?? 0
        alts = alts.filter((a) => cappedOf(a) > own + 0.5 && cappedOf(a) >= 13)
        alts.sort((a, b) => cappedOf(b) - cappedOf(a))
        const best = alts[0]
        if (!best) return null
        return { product: c.product, info: c.info, alternative: best }
      } catch {
        return null
      }
    }),
  )
  return results.filter((x): x is Suggestion<T> => x !== null)
}
