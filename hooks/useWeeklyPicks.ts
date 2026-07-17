/**
 * useWeeklyPicks — « Pépites du jour » : sélection QUOTIDIENNE de produits
 * catalogue adaptés au profil, DÉTERMINISTE (0 IA runtime, 0 crédit).
 *
 * Pipeline :
 *   1. needs dominants du profil (pickNeedsForUser, top 3), tournés par jour ;
 *   2. RPC batch cosme_check_weekly_picks_candidates (sur-échantillon /need) ;
 *   3. familles restreintes -> noms INCI (cache partagé 1h avec useAlternatives) ;
 *   4. filtre restrictions + PLANCHER SANTÉ (pastille verte ≥13, 4-5★) + tri
 *      tiers + round-robin + diversité (selectWeeklyPicks).
 *
 * Clé React Query = ['weeklyPicks', userId, dayKey, restrictionsSig], staleTime
 * 24 h, persistée : les picks sont FIGÉS pour la journée puis TOURNENT chaque
 * jour (dayKey = date locale). La graine `${userId}:${dayKey}:${restrictions}`
 * garantit le déterminisme (mêmes picks toute la journée, différents demain) et
 * la variété (mélange seedé par jour dans le pool sain de chaque need). Un
 * changement de restrictions en cours de journée change la clé (sécurité).
 */

import { useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { useProfile } from '@/hooks/useProfile'
import { isProfileStarted } from '@/lib/skin/profile'
import { localDayKey } from '@/lib/skin/week'
import { restrictionsKey } from '@/lib/analysis/restrictionsKey'
import { hashSeed } from '@/lib/analysis/tierShuffle'
import { fetchFamilyIngredientNames } from '@/lib/catalog/familyIngredientNames'
import { buildExclusionSet } from '@/lib/analysis/alternativesFilter'
import { prefetchProductsAnalyses } from '@/lib/analysis/eanAnalysisPrefetch'
import {
  pickNeedsForUser,
} from '@/lib/weeklyPicks/needsMap'
import {
  buildWeeklyPicksSeed,
  selectWeeklyPicks,
  type WeeklyPickCandidate,
} from '@/lib/weeklyPicks/select'

const DAY_MS = 24 * 60 * 60 * 1000
const FAMILY_NAMES_STALE_MS = 60 * 60 * 1000
/**
 * Plancher santé des Pépites : note plafonnée >= 13 = pastille VERTE uniquement
 * (feuille verte ≥13 "Bien" 4★, cœur vert ≥17 "Très bien" 5★). Écarte jaune /
 * orange / rouge : « toujours sain, entre 4 et 5 étoiles ».
 */
const HEALTHY_MIN_CAPPED_SCORE = 13

interface RpcRow {
  need: string
  ean: string
  brand: string | null
  name: string | null
  image_url: string | null
  score: number | null
  family: string | null
  sub_category: string | null
  ingredients_text: string | null
  count_orange: number | null
  count_rouge: number | null
  count_total: number | null
}

function toCandidate(r: RpcRow): WeeklyPickCandidate {
  return {
    ean: String(r.ean),
    brand: r.brand,
    name: r.name,
    imageUrl: r.image_url,
    score: r.score,
    scoreLabel: null,
    scoreTone: null,
    countTotal: r.count_total,
    ingredientsText: r.ingredients_text,
    countOrange: r.count_orange ?? 0,
    countRouge: r.count_rouge ?? 0,
    need: r.need,
    subCategory: r.sub_category,
    family: r.family,
  }
}

export interface UseWeeklyPicksResult {
  picks: WeeklyPickCandidate[]
  isLoading: boolean
  isError: boolean
  /** Profil sans aucun signal -> carte CTA « complète ton profil ». */
  isEmptyProfile: boolean
  /** Clé de jour local (rotation quotidienne), ex. '2026-07-17'. */
  dayKey: string
}

export function useWeeklyPicks(enabled: boolean): UseWeeklyPicksResult {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const { skin, restrictions } = useProfile()
  const qc = useQueryClient()

  const dayKey = useMemo(() => localDayKey(), [])
  const restrictionsCanonical = useMemo(() => restrictionsKey(restrictions), [restrictions])
  const restrictionsSig = useMemo(
    () =>
      hashSeed(
        restrictionsCanonical + '|' + (skin.allergiesFreeform ?? ''),
      ).toString(36),
    [restrictionsCanonical, skin.allergiesFreeform],
  )
  const profileStarted = useMemo(() => isProfileStarted(skin), [skin])

  const query = useQuery<WeeklyPickCandidate[]>({
    queryKey: ['weeklyPicks', userId, dayKey, restrictionsSig],
    enabled: enabled && Boolean(userId) && profileStarted,
    staleTime: DAY_MS,
    gcTime: DAY_MS,
    queryFn: async () => {
      const needs = pickNeedsForUser(skin, dayKey, 3)
      if (needs.length === 0) return []

      // p_per_need = 40 = tout le pool précalculé par besoin (600 lignes max,
      // lecture ~0.4 ms) : donne au tirage seedé de quoi varier chaque semaine.
      const { data, error } = await supabase.rpc(
        'cosme_check_weekly_picks_candidates' as never,
        { p_needs: needs, p_per_need: 40 } as never,
      )
      if (error) throw error
      const candidates = ((data as RpcRow[] | null) ?? []).map(toCandidate)
      if (candidates.length === 0) return []

      // Familles restreintes -> noms INCI (cache 1h partagé avec useAlternatives).
      const familyNames =
        restrictions.families.length > 0
          ? await qc.fetchQuery({
              queryKey: ['family-inci-names', restrictions.families],
              queryFn: () => fetchFamilyIngredientNames(restrictions.families),
              staleTime: FAMILY_NAMES_STALE_MS,
            })
          : []

      const exclusion = buildExclusionSet({
        restrictions,
        familyIngredientNames: familyNames,
        allergiesFreeform: skin.allergiesFreeform ?? null,
      })

      const picks = selectWeeklyPicks({
        candidates,
        exclusion,
        seed: buildWeeklyPicksSeed(userId ?? 'anon', dayKey, restrictionsCanonical),
        max: 6,
        maxPerSubCategory: 2,
        minCappedScore: HEALTHY_MIN_CAPPED_SCORE,
      })

      // Précharge les analyses pour un tap quasi instantané (chemin rapide EAN).
      prefetchProductsAnalyses(qc, picks.map((p) => p.ean), 6)
      return picks
    },
  })

  return {
    picks: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    isEmptyProfile: !profileStarted,
    dayKey,
  }
}
