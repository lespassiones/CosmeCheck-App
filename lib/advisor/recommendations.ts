/**
 * Récupération des produits recommandés par le Beauty Advisor.
 *
 * À partir des critères extraits du bloc RECO ({ ingredients, form }) :
 *   1. RPC `cosme_check_recommend_products` : produits du catalogue du bon TYPE
 *      (le `form` pilote), classés par pertinence ingrédients puis score, badge
 *      minimum (score >= 15). Les restrictions (familles + ingrédients) sont
 *      appliquées CÔTÉ SERVEUR, AVANT la limite : on récupère donc 24 produits
 *      déjà compatibles, au lieu de filtrer une liste déjà tronquée (qui pouvait
 *      tomber à 1 seul produit quand beaucoup de restrictions sont actives).
 *   2. Les allergies en texte libre restent filtrées côté client (match
 *      sous-chaîne, que la RPC ne gère pas).
 *
 * On ne propose QUE des produits sûrs et compatibles avec le profil.
 */
import { supabase } from '@/lib/supabase/client'
import {
  buildExclusionSet,
  filterAlternatives,
  isExclusionEmpty,
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
  /**
   * Nb de produits du TYPE demandé AVANT le filtre restrictions.
   * > 0 alors que `products` est vide => ce sont les restrictions qui bloquent.
   */
  rawCount: number
}

function mapRows(data: RecoRpcRow[]): AlternativeProduct[] {
  return data.map((r) => ({
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
}

export async function fetchAdvisorRecommendations(opts: {
  ingredients: string[]
  form: string | null
  restrictions: UserRestrictions
  allergiesFreeform?: string | null
  /** Nb de produits à AFFICHER (slice final). Défaut 10. */
  limit?: number
  /** Nb de produits à RÉCUPÉRER côté base (p_limit RPC, plafonné à 50). Défaut 24. */
  fetchLimit?: number
}): Promise<AdvisorRecoResult> {
  const excludeFamilies = opts.restrictions.families ?? []
  const excludeIngredients = (opts.restrictions.ingredients ?? [])
    .map((i) => i.name)
    .filter((n): n is string => !!n)

  const { data, error } = await supabase.rpc(
    'cosme_check_recommend_products' as never,
    {
      p_terms: opts.ingredients,
      p_form: opts.form,
      p_min_score: ADVISOR_MIN_SCORE,
      p_limit: Math.min(opts.fetchLimit ?? 24, 50),
      p_exclude_families: excludeFamilies,
      p_exclude_ingredients: excludeIngredients,
    } as never,
  )
  if (error || !data) return { products: [], rawCount: 0 }

  let products = mapRows(data as RecoRpcRow[])

  // Allergies en texte libre : non gérées par la RPC, filtrées ici (sous-chaîne).
  const freeformEx = buildExclusionSet({
    restrictions: { families: [], ingredients: [] } as unknown as UserRestrictions,
    familyIngredientNames: [],
    allergiesFreeform: opts.allergiesFreeform ?? null,
  })
  if (!isExclusionEmpty(freeformEx)) {
    products = filterAlternatives(products, freeformEx)
  }

  const display = products.slice(0, opts.limit ?? 10)

  // rawCount : seulement utile pour distinguer « bloqué par restrictions » de
  // « rien trouvé ». On ne paie une requête de sonde QUE si la liste est vide.
  let rawCount = products.length
  if (products.length === 0) {
    const probe = await supabase.rpc(
      'cosme_check_recommend_products' as never,
      {
        p_terms: opts.ingredients,
        p_form: opts.form,
        p_min_score: ADVISOR_MIN_SCORE,
        p_limit: 1,
        p_exclude_families: [],
        p_exclude_ingredients: [],
      } as never,
    )
    const probeRows = probe.data as RecoRpcRow[] | null
    rawCount = Array.isArray(probeRows) ? probeRows.length : 0
  }

  return { products: display, rawCount }
}
