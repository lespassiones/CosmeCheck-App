/**
 * useRoutine — gestion de la routine beauté contre le VRAI schéma
 * (`cosme_check.routine_items` + jointure `analyses`).
 *
 * Une ligne `routine_items` ne porte que (id, user_id, analysis_id, frequency,
 * added_at) ; le nom / score / couleur viennent de l'analyse jointe. On lit donc
 * `analysis:analyses(id,name,product_label,score,result_json)`.
 *
 * Lectures via react-query, écritures via `db()` + invalidation du cache.
 */

import { useCallback, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { db } from '@/lib/supabase/client'
import type { RoutineItemRow, RoutineFrequency } from '@/lib/supabase/types'
import { useAuth } from '@/hooks/useAuth'

export interface RoutineJoinedAnalysis {
  id: string
  name: string | null
  product_label: string | null
  score: number | null
  result_json: unknown
}

export type RoutineItem = RoutineItemRow & {
  analysis: RoutineJoinedAnalysis | null
}

interface UseRoutineReturn {
  items: RoutineItem[]
  isLoading: boolean
  error: string | null
  addToRoutine: (analysisId: string, frequency?: RoutineFrequency) => Promise<void>
  removeFromRoutine: (itemId: string) => Promise<void>
  updateFrequency: (itemId: string, frequency: RoutineFrequency) => Promise<void>
  isInRoutine: (analysisId: string) => boolean
  refresh: () => void
}

const SELECT = 'id,user_id,analysis_id,frequency,added_at,analysis:analyses(id,name,product_label,score,result_json)'

/** Supabase renvoie la relation jointe en objet ou en tableau selon la config. */
function normalizeAnalysis(raw: unknown): RoutineJoinedAnalysis | null {
  const value = Array.isArray(raw) ? raw[0] : raw
  if (!value || typeof value !== 'object') return null
  const r = value as Record<string, unknown>
  if (typeof r.id !== 'string') return null
  return {
    id: r.id,
    name: typeof r.name === 'string' ? r.name : null,
    product_label: typeof r.product_label === 'string' ? r.product_label : null,
    score: typeof r.score === 'number' ? r.score : null,
    result_json: r.result_json ?? null,
  }
}

function normalizeItem(raw: Record<string, unknown>): RoutineItem {
  return {
    id: String(raw.id),
    user_id: String(raw.user_id),
    analysis_id: String(raw.analysis_id),
    frequency: (raw.frequency as RoutineFrequency) ?? 'daily',
    added_at: String(raw.added_at),
    analysis: normalizeAnalysis(raw.analysis),
  }
}

export function useRoutine(): UseRoutineReturn {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const queryClient = useQueryClient()

  const queryKey = useMemo(() => ['routine', userId] as const, [userId])

  const {
    data: items = [],
    isLoading,
    error: queryError,
    refetch,
  } = useQuery<RoutineItem[]>({
    queryKey,
    enabled: Boolean(userId),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!userId) return []
      const { data, error } = await db()
        .from('routine_items')
        .select(SELECT)
        .eq('user_id', userId)
        .order('added_at', { ascending: false })
      if (error) throw error
      return ((data as Record<string, unknown>[] | null) ?? []).map(normalizeItem)
    },
  })

  const addMutation = useMutation<void, Error, { analysisId: string; frequency: RoutineFrequency }>({
    mutationFn: async ({ analysisId, frequency }) => {
      if (!userId) throw new Error('Utilisateur non authentifié')
      const { error } = await db()
        .from('routine_items')
        .insert({ user_id: userId, analysis_id: analysisId, frequency })
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey })
    },
  })

  const removeMutation = useMutation<void, Error, string>({
    mutationFn: async (itemId) => {
      const { error } = await db().from('routine_items').delete().eq('id', itemId)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey })
    },
  })

  const frequencyMutation = useMutation<void, Error, { itemId: string; frequency: RoutineFrequency }>({
    mutationFn: async ({ itemId, frequency }) => {
      const { error } = await db().from('routine_items').update({ frequency }).eq('id', itemId)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey })
    },
  })

  const addToRoutine = useCallback(
    async (analysisId: string, frequency: RoutineFrequency = 'daily') => {
      await addMutation.mutateAsync({ analysisId, frequency })
    },
    [addMutation],
  )

  const removeFromRoutine = useCallback(
    async (itemId: string) => {
      await removeMutation.mutateAsync(itemId)
    },
    [removeMutation],
  )

  const updateFrequency = useCallback(
    async (itemId: string, frequency: RoutineFrequency) => {
      await frequencyMutation.mutateAsync({ itemId, frequency })
    },
    [frequencyMutation],
  )

  const isInRoutine = useCallback(
    (analysisId: string) => items.some((item) => item.analysis_id === analysisId),
    [items],
  )

  const refresh = useCallback(() => {
    void refetch()
  }, [refetch])

  const error =
    (queryError instanceof Error ? queryError.message : null) ||
    addMutation.error?.message ||
    removeMutation.error?.message ||
    frequencyMutation.error?.message ||
    null

  return {
    items,
    isLoading,
    error,
    addToRoutine,
    removeFromRoutine,
    updateFrequency,
    isInRoutine,
    refresh,
  }
}
