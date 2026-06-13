/**
 * Récupération des produits recommandés par le Beauty Advisor.
 *
 * À partir des critères extraits du bloc RECO ({ ingredients, form }) :
 *   1. RPC `cosme_check_recommend_products` : produits du catalogue contenant
 *      les ingrédients demandés, badge feuille minimum (score >= 13), triés par
 *      nombre d'ingrédients trouvés puis score.
 *   2. Filtrage côté client par les restrictions de l'utilisateur (familles +
 *      ingrédients + allergies), en réutilisant la même logique que les
 *      alternatives (buildExclusionSet / filterAlternatives).
 *
 * On ne propose QUE des produits sûrs et compatibles avec le profil.
 */
import { supabase } from '@/lib/supabase/client'
import { fetchFamilyIngredientNames } from '@/lib/catalog/familyIngredientNames'
import {
  buildExclusionSet,
  filterAlternatives,
  type AlternativeProduct,
} from '@/lib/analysis/alternativesFilter'
import type { UserRestrictions } from '@/lib/supabase/types'

interface RecoRpcRow {
  ean: string
  brand: string | null
  name: string | null
  category: string | null
  image_url: string | null
  score: number | null
  score_label: string | null
  score_tone: string | null
  count_total: number | null
  ingredients_text: string | null
  match_count: number | null
}

export const ADVISOR_MIN_SCORE = 15 // qualité : entre feuille (13) et cœur (17)

export interface AdvisorRecoResult {
  /** Produits sûrs compatibles avec les restrictions (à afficher). */
  products: AlternativeProduct[]
  /** Nb de produits remontés par la base AVANT le filtre restrictions. */
  rawCount: number
}

export async function fetchAdvisorRecommendations(opts: {
  ingredients: string[]
  form: string | null
  restrictions: UserRestrictions
  allergiesFreeform?: string | null
  limit?: number
}): Promise<AdvisorRecoResult> {
  const { data, error } = await supabase.rpc(
    'cosme_check_recommend_products' as never,
    {
      p_terms: opts.ingredients,
      p_form: opts.form,
      p_min_score: ADVISOR_MIN_SCORE,
      p_limit: 24,
    } as never,
  )
  if (error || !data) return { products: [], rawCount: 0 }

  const products: AlternativeProduct[] = (data as RecoRpcRow[]).map((r) => ({
    ean: r.ean,
    brand: r.brand,
    name: r.name,
    imageUrl: r.image_url,
    score: r.score,
    scoreLabel: r.score_label,
    scoreTone: r.score_tone,
    countTotal: r.count_total,
    ingredientsText: r.ingredients_text,
    countOrange: 0,
    countRouge: 0,
  }))

  // Filtre restrictions (familles résolues en noms INCI + ingrédients + allergies).
  const familyNames = await fetchFamilyIngredientNames(opts.restrictions.families).catch(
    () => [] as string[],
  )
  const exclusion = buildExclusionSet({
    restrictions: opts.restrictions,
    familyIngredientNames: familyNames,
    allergiesFreeform: opts.allergiesFreeform ?? null,
  })

  const filtered = filterAlternatives(products, exclusion).slice(0, opts.limit ?? 10)
  return { products: filtered, rawCount: products.length }
}
