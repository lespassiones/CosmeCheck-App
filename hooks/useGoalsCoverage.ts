/**
 * useGoalsCoverage — état + actions du bloc « Couverture de tes objectifs ».
 *
 * LECTURE (0 crédit, 0 IA) : lit directement la ligne persistée
 * cosme_check.routine_goal_coverage (RLS). Pas d'appel edge pour afficher →
 * scalable (le coût d'affichage est un simple SELECT indexé par PK).
 *
 * ÉVALUATION / RELOAD : invoque l'edge `goals-coverage` (3 crédits). Le bouton
 * reload n'est actif que si la routine a changé depuis le dernier calcul
 * (comparaison de signatures côté client, sans round-trip).
 *
 * États : loading | no_goals | empty_routine | needs_eval | ready.
 */

import { useCallback, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { db, supabase } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { useProfile } from '@/hooks/useProfile'
import { useRoutine } from '@/hooks/useRoutine'
import {
  type CoverageItem,
  collectGoals,
  type GoalCoverageRow,
  GOALS_COVERAGE_VERSION,
  goalsSignatureFromSkin,
  routineSignatureFromItems,
} from '@/lib/routine/goalsCoverage'

export type GoalsCoverageState =
  | 'loading'
  | 'no_goals'
  | 'empty_routine'
  | 'needs_eval'
  | 'ready'

export interface UseGoalsCoverage {
  state: GoalsCoverageState
  coverage: CoverageItem[]
  /** La routine a changé depuis le dernier calcul → reload pertinent. */
  reloadEnabled: boolean
  /** Les objectifs ont changé depuis le dernier calcul (résultat périmé). */
  goalsChanged: boolean
  isEvaluating: boolean
  /** Dernière évaluation bloquée faute de crédits (→ /offre). */
  noCredits: boolean
  errored: boolean
  goalCount: number
  productCount: number
  evaluate: (force?: boolean) => Promise<void>
}

type InvokeResult = {
  state?: string
  coverage?: CoverageItem[]
  routineSignature?: string
  goalsSignature?: string
  productCount?: number
  /** true = renvoyé depuis le cache (routine inchangée) → aucun crédit débité. */
  cached?: boolean
}

export function useGoalsCoverage(): UseGoalsCoverage {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const queryClient = useQueryClient()
  const { skin } = useProfile()
  const { items } = useRoutine()

  const queryKey = useMemo(() => ['goalsCoverage', userId] as const, [userId])

  const { data: row, isLoading } = useQuery<GoalCoverageRow | null>({
    queryKey,
    enabled: Boolean(userId),
    staleTime: 60 * 1000,
    queryFn: async () => {
      if (!userId) return null
      const { data, error } = await db()
        .from('routine_goal_coverage')
        .select('coverage, routine_signature, goals_signature, model_version, product_count, updated_at')
        .eq('user_id', userId)
        .maybeSingle()
      if (error) throw error
      return (data as GoalCoverageRow | null) ?? null
    },
  })

  const goals = useMemo(() => collectGoals(skin), [skin])
  const goalCount = goals.length
  const currentGoalsSig = useMemo(() => goalsSignatureFromSkin(skin), [skin])

  const analysisItems = useMemo(() => items.filter((it) => it.analysis), [items])
  const productCount = analysisItems.length
  const currentRoutineSig = useMemo(
    () => routineSignatureFromItems(items.map((it) => ({ analysis_id: it.analysis_id, frequency: it.frequency }))),
    [items],
  )

  const isFresh = Boolean(
    row && row.model_version === GOALS_COVERAGE_VERSION && row.goals_signature === currentGoalsSig,
  )

  const state: GoalsCoverageState = isLoading
    ? 'loading'
    : goalCount === 0
    ? 'no_goals'
    : productCount === 0
    ? 'empty_routine'
    : isFresh
    ? 'ready'
    : 'needs_eval'

  const reloadEnabled = state === 'ready' && !!row && row.routine_signature !== currentRoutineSig
  const goalsChanged =
    !!row && goalCount > 0 && productCount > 0 && row.goals_signature !== currentGoalsSig

  const coverage = useMemo<CoverageItem[]>(() => {
    if (state !== 'ready' || !row) return []
    return Array.isArray(row.coverage) ? row.coverage : []
  }, [state, row])

  const mutation = useMutation<InvokeResult, Error, boolean>({
    mutationFn: async (force: boolean) => {
      const { data, error, response } = await supabase.functions.invoke('goals-coverage', {
        body: force ? { force: true } : {},
      })
      if (error) {
        const status =
          response?.status ?? (error as { context?: Response }).context?.status ?? null
        if (status === 429) {
          const e = new Error('no_credits') as Error & { code?: string }
          e.code = 'no_credits'
          throw e
        }
        throw error
      }
      return (data ?? {}) as InvokeResult
    },
    onSuccess: (data) => {
      if (data?.state === 'ok' && userId) {
        queryClient.setQueryData<GoalCoverageRow>(queryKey, {
          coverage: data.coverage ?? [],
          routine_signature: data.routineSignature ?? '',
          goals_signature: data.goalsSignature ?? '',
          model_version: GOALS_COVERAGE_VERSION,
          product_count: data.productCount ?? productCount,
          updated_at: new Date().toISOString(),
        })
      } else {
        void queryClient.invalidateQueries({ queryKey })
      }
      // Rechargement à vide (routine inchangée → cache) = 0 crédit consommé :
      // inutile de rafraîchir le solde. On ne l'invalide qu'en cas de recalcul.
      if (!data?.cached) void queryClient.invalidateQueries({ queryKey: ['credits'] })
    },
  })

  const noCredits = (mutation.error as (Error & { code?: string }) | null)?.code === 'no_credits'
  const errored = mutation.isError && !noCredits

  const evaluate = useCallback(
    async (force = false) => {
      try {
        await mutation.mutateAsync(force)
      } catch {
        // états surfacés via noCredits / errored
      }
    },
    [mutation],
  )

  return {
    state,
    coverage,
    reloadEnabled,
    goalsChanged,
    isEvaluating: mutation.isPending,
    noCredits,
    errored,
    goalCount,
    productCount,
    evaluate,
  }
}
