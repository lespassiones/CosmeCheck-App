/**
 * Récupération des produits recommandés par le Beauty Advisor.
 *
 * À partir des critères du bloc RECO ({ ingredients, form, exclude }) :
 *   1. RPC `cosme_check_recommend_products` : produits du bon TYPE (`form` pilote),
 *      classés par pertinence ingrédients puis score, badge >= 15. Les restrictions
 *      du PROFIL **et** les contraintes ad-hoc du message (« sans parfum »…) sont
 *      appliquées CÔTÉ SERVEUR, avant la limite.
 *   2. Allergies en texte libre : filtrées côté client (sous-chaîne).
 *   3. RELÂCHEMENT INTELLIGENT : si plus AUCUN produit ne coche TOUTES les contraintes
 *      ad-hoc, on identifie laquelle bloque et on propose le meilleur compromis
 *      (« j'en ai X sans parfum mais qui peuvent contenir de l'alcool »). On ne
 *      relâche JAMAIS les restrictions du profil (règles dures de l'utilisateur).
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
import { resolveExclusion, type ExcludeSpec } from '@/lib/advisor/excludeMap'
import type { UserRestrictions } from '@/lib/supabase/types'

/**
 * Cache simple en mémoire pour les recommandations.
 * TTL 30 minutes = évite les appels multiples au relâchement.
 */
const recommendationCache = new Map<
  string,
  { result: AdvisorRecoResult; expiry: number }
>()

function getCacheKey(opts: {
  ingredients: string[]
  form: string | null
  restrictions: UserRestrictions
  exclude?: string[]
  allergiesFreeform?: string | null
}): string {
  return JSON.stringify({
    ingredients: opts.ingredients.sort(),
    form: opts.form,
    families: (opts.restrictions.families ?? []).sort(),
    ingredients_: (opts.restrictions.ingredients ?? [])
      .map((i) => i.name)
      .filter((n): n is string => !!n)
      .sort(),
    exclude: (opts.exclude ?? []).sort(),
    allergies: opts.allergiesFreeform,
  })
}

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

export interface AdvisorRelaxation {
  /** Contraintes ad-hoc conservées dans le set relâché (« sans parfum »). */
  keptLabels: string[]
  /** Contraintes ad-hoc qu'on a dû lâcher pour trouver des produits (« sans alcool »). */
  droppedLabels: string[]
  /** Le set de produits relâché à proposer. */
  products: AlternativeProduct[]
}

export interface AdvisorRecoResult {
  /** Produits respectant TOUTES les contraintes (profil + ad-hoc). */
  products: AlternativeProduct[]
  /** Nb de produits du TYPE avant restrictions (>0 + products vide => bloqué par restrictions). */
  rawCount: number
  /** Présent quand `products` est vide mais qu'un compromis existe (cf. ci-dessus). */
  relaxation?: AdvisorRelaxation | null
}

function mapRows(data: unknown): AlternativeProduct[] {
  const rows = (data as RecoRpcRow[] | null) ?? []
  if (!Array.isArray(rows)) return []
  return rows.map((r) => ({
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
  /** Contraintes ad-hoc du message (mots-clés canoniques, cf. excludeMap). */
  exclude?: string[]
  allergiesFreeform?: string | null
  /** Nb de produits à AFFICHER (slice final). Défaut 10. */
  limit?: number
  /** Nb de produits à RÉCUPÉRER côté base (p_limit RPC, plafonné à 50). Défaut 24. */
  fetchLimit?: number
}): Promise<AdvisorRecoResult> {
  // Vérifier le cache (30 min TTL)
  const cacheKey = getCacheKey(opts)
  const cached = recommendationCache.get(cacheKey)
  if (cached && Date.now() < cached.expiry) {
    return cached.result
  }

  const displayLimit = opts.limit ?? 10
  const fetchLimit = Math.min(opts.fetchLimit ?? 24, 50)

  const profileFamilies = opts.restrictions.families ?? []
  const profileIngredients = (opts.restrictions.ingredients ?? [])
    .map((i) => i.name)
    .filter((n): n is string => !!n)

  // Contraintes ad-hoc reconnues (les inconnues/sensorielles sont ignorées ici,
  // l'advisor les décline dans son texte).
  const adhoc: { keyword: string; spec: ExcludeSpec }[] = []
  for (const kw of opts.exclude ?? []) {
    const spec = resolveExclusion(kw)
    if (spec) adhoc.push({ keyword: kw, spec })
  }

  // Filtre freeform (allergies texte libre) : non géré par la RPC.
  const freeformEx = buildExclusionSet({
    restrictions: { families: [], ingredients: [] } as unknown as UserRestrictions,
    familyIngredientNames: [],
    allergiesFreeform: opts.allergiesFreeform ?? null,
  })
  const applyFreeform = (products: AlternativeProduct[]) =>
    isExclusionEmpty(freeformEx) ? products : filterAlternatives(products, freeformEx)

  // Appel RPC avec un sous-ensemble de contraintes ad-hoc actives.
  const query = async (activeAdhoc: { spec: ExcludeSpec }[]): Promise<AlternativeProduct[]> => {
    const families = [...new Set([...profileFamilies, ...activeAdhoc.flatMap((a) => a.spec.families)])]
    const ingredients = [...new Set([...profileIngredients, ...activeAdhoc.flatMap((a) => a.spec.ingredients)])]
    const { data, error } = await supabase.rpc(
      'cosme_check_recommend_products' as never,
      {
        p_terms: opts.ingredients,
        p_form: opts.form,
        p_min_score: ADVISOR_MIN_SCORE,
        p_limit: fetchLimit,
        p_exclude_families: families,
        p_exclude_ingredients: ingredients,
      } as never,
    )
    if (error || !data) return []
    return applyFreeform(mapRows(data))
  }

  // 1) Set STRICT : toutes les contraintes (profil + ad-hoc).
  const strict = await query(adhoc)
  if (strict.length > 0 || adhoc.length === 0) {
    let rawCount = strict.length
    if (strict.length === 0) {
      // Distinguer « bloqué par restrictions » de « rien trouvé » : sonde sans aucune exclusion.
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
      rawCount = Array.isArray(probe.data) ? (probe.data as unknown[]).length : 0
    }
    const result = { products: strict.slice(0, displayLimit), rawCount, relaxation: null }
    // Mettre en cache
    recommendationCache.set(cacheKey, {
      result,
      expiry: Date.now() + 30 * 60 * 1000, // 30 min
    })
    return result
  }

  // 2) STRICT vide AVEC contraintes ad-hoc -> RELÂCHEMENT : on cherche quelle
  //    contrainte lâcher pour retrouver des produits (jamais le profil).
  const drops = await Promise.all(
    adhoc.map(async (dropped) => {
      const kept = adhoc.filter((a) => a !== dropped)
      const products = await query(kept)
      return { dropped, kept, products }
    }),
  )
  let best = drops.filter((d) => d.products.length > 0).sort((a, b) => b.products.length - a.products.length)[0] ?? null

  // Si lâcher UNE contrainte ne suffit pas, on lâche TOUTES les ad-hoc (profil conservé).
  if (!best) {
    const onlyProfile = await query([])
    if (onlyProfile.length > 0) {
      best = { dropped: null as never, kept: [], products: onlyProfile }
    }
  }

  if (!best) {
    // Vraiment rien, même profil seul : sonde pour le message restrictions vs none.
    const probe = await supabase.rpc(
      'cosme_check_recommend_products' as never,
      { p_terms: opts.ingredients, p_form: opts.form, p_min_score: ADVISOR_MIN_SCORE, p_limit: 1, p_exclude_families: [], p_exclude_ingredients: [] } as never,
    )
    const rawCount = Array.isArray(probe.data) ? (probe.data as unknown[]).length : 0
    const result = { products: [], rawCount, relaxation: null }
    // Mettre en cache
    recommendationCache.set(cacheKey, {
      result,
      expiry: Date.now() + 30 * 60 * 1000, // 30 min
    })
    return result
  }

  const droppedLabels = best.dropped
    ? [best.dropped.spec.label]
    : adhoc.map((a) => a.spec.label) // cas « toutes lâchées »
  const keptLabels = best.dropped ? best.kept.map((a) => a.spec.label) : []

  const result = {
    products: [],
    rawCount: 0,
    relaxation: {
      keptLabels: [...new Set(keptLabels)],
      droppedLabels: [...new Set(droppedLabels)],
      products: best.products.slice(0, displayLimit),
    },
  }
  // Mettre en cache
  recommendationCache.set(cacheKey, {
    result,
    expiry: Date.now() + 30 * 60 * 1000, // 30 min
  })
  return result
}
