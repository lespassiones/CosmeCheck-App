/**
 * useRoutine — gestion de la routine beauté contre le VRAI schéma
 * (`cosme_check.routine_items` + jointure `analyses`).
 *
 * Une ligne `routine_items` porte (id, user_id, analysis_id, frequency,
 * added_at, time_of_day, position) ; le nom / score / couleur viennent de
 * l'analyse jointe. On lit donc `analysis:analyses(...)`.
 *
 * time_of_day ('morning' | 'evening' | 'both') et position sont l'axe
 * d'ORGANISATION matin/soir (juillet 2026) : ils pilotent l'affichage en deux
 * sections et l'ordre manuel, PAS le modèle d'exposition (lib/routine/engine.ts
 * reste pondéré par fréquence uniquement).
 *
 * Lectures via react-query. setTimeOfDay et reorderItems sont OPTIMISTES
 * (patch du cache + rollback) : sans cela, un drag "snap back" visuellement
 * jusqu'au refetch. Le réordonnancement batch passe par la RPC atomique
 * `cosme_check_reorder_routine` (un seul round-trip, owner-scoped).
 */

import { useCallback, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { phCapture } from '@/lib/analytics/posthog'

import { showToast } from '@/components/shared/Toast'

import { db, supabase } from '@/lib/supabase/client'
import type {
  Json,
  RoutineItemRow,
  RoutineFrequency,
  RoutineTimeOfDay,
  RoutineItemKind,
} from '@/lib/supabase/types'
import { useAuth } from '@/hooks/useAuth'

export interface RoutineJoinedAnalysis {
  id: string
  name: string | null
  product_label: string | null
  brand: string | null
  score: number | null
  result_json: unknown
  category: string | null
  category_precise: string | null
  ean: string | null
}

export type RoutineItem = RoutineItemRow & {
  analysis: RoutineJoinedAnalysis | null
}

/** Mise à jour batch d'organisation (RPC cosme_check_reorder_routine). */
export interface RoutineReorderUpdate {
  id: string
  time_of_day?: RoutineTimeOfDay
  position: number
}

interface UseRoutineReturn {
  items: RoutineItem[]
  isLoading: boolean
  error: string | null
  addToRoutine: (
    analysisId: string,
    frequency?: RoutineFrequency,
    kind?: RoutineItemKind,
  ) => Promise<void>
  removeFromRoutine: (itemId: string) => Promise<void>
  updateFrequency: (itemId: string, frequency: RoutineFrequency) => Promise<void>
  setTimeOfDay: (itemId: string, timeOfDay: RoutineTimeOfDay) => Promise<void>
  setKind: (itemId: string, kind: RoutineItemKind) => Promise<void>
  reorderItems: (updates: RoutineReorderUpdate[]) => Promise<void>
  isInRoutine: (analysisId: string) => boolean
  refresh: () => void
}

const SELECT =
  'id,user_id,analysis_id,frequency,added_at,time_of_day,position,kind,analysis:analyses(id,name,product_label,brand,score,result_json,category,category_precise,ean)'

const TIME_OF_DAY_VALUES: readonly RoutineTimeOfDay[] = ['morning', 'evening', 'both']

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
    brand: typeof r.brand === 'string' ? r.brand : null,
    score: typeof r.score === 'number' ? r.score : null,
    result_json: r.result_json ?? null,
    category: typeof r.category === 'string' ? r.category : null,
    category_precise: typeof r.category_precise === 'string' ? r.category_precise : null,
    ean: typeof r.ean === 'string' ? r.ean : null,
  }
}

function normalizeItem(raw: Record<string, unknown>): RoutineItem {
  const tod = raw.time_of_day
  return {
    id: String(raw.id),
    user_id: String(raw.user_id),
    analysis_id: String(raw.analysis_id),
    frequency: (raw.frequency as RoutineFrequency) ?? 'daily',
    added_at: String(raw.added_at),
    time_of_day: TIME_OF_DAY_VALUES.includes(tod as RoutineTimeOfDay)
      ? (tod as RoutineTimeOfDay)
      : 'morning',
    position: typeof raw.position === 'number' ? raw.position : 0,
    kind: raw.kind === 'staple' ? 'staple' : 'routine',
    analysis: normalizeAnalysis(raw.analysis),
  }
}

/** Tri canonique de la routine : position ASC, puis added_at ASC (stabilité). */
function sortItems(items: RoutineItem[]): RoutineItem[] {
  return [...items].sort((a, b) => {
    if (a.position !== b.position) return a.position - b.position
    return a.added_at.localeCompare(b.added_at)
  })
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
        .order('position', { ascending: true })
        .order('added_at', { ascending: true })
      if (error) throw error
      return ((data as Record<string, unknown>[] | null) ?? []).map(normalizeItem)
    },
  })

  const addMutation = useMutation<
    void,
    Error,
    { analysisId: string; frequency: RoutineFrequency; kind: RoutineItemKind }
  >({
    mutationFn: async ({ analysisId, frequency, kind }) => {
      if (!userId) throw new Error('Utilisateur non authentifié')
      // Position en fin de liste (défaut créneau MATIN pour la routine soin).
      const current = queryClient.getQueryData<RoutineItem[]>(queryKey) ?? []
      const nextPosition = current.reduce((max, it) => Math.max(max, it.position), -1) + 1
      const { error } = await db()
        .from('routine_items')
        .insert({
          user_id: userId,
          analysis_id: analysisId,
          frequency,
          time_of_day: 'morning',
          position: nextPosition,
          kind,
        })
      if (error) throw error
      phCapture('routine_item_added')
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey })
    },
    onError: () => showToast("Ajout à la routine impossible. Réessaie.", 'error'),
  })

  const kindMutation = useMutation<
    void,
    Error,
    { itemId: string; kind: RoutineItemKind },
    { previous: RoutineItem[] | undefined }
  >({
    mutationFn: async ({ itemId, kind }) => {
      const { error } = await db().from('routine_items').update({ kind }).eq('id', itemId)
      if (error) throw error
    },
    onMutate: async ({ itemId, kind }) => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<RoutineItem[]>(queryKey)
      queryClient.setQueryData<RoutineItem[]>(queryKey, (old) =>
        (old ?? []).map((it) => (it.id === itemId ? { ...it, kind } : it)),
      )
      return { previous }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(queryKey, ctx.previous)
      showToast('Déplacement impossible. Réessaie.', 'error')
    },
    onSettled: () => {
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
    onError: () => showToast('Suppression impossible. Réessaie.', 'error'),
  })

  const frequencyMutation = useMutation<void, Error, { itemId: string; frequency: RoutineFrequency }>({
    mutationFn: async ({ itemId, frequency }) => {
      const { error } = await db().from('routine_items').update({ frequency }).eq('id', itemId)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey })
    },
    onError: () => showToast('Mise à jour impossible. Réessaie.', 'error'),
  })

  const timeOfDayMutation = useMutation<
    void,
    Error,
    { itemId: string; timeOfDay: RoutineTimeOfDay },
    { previous: RoutineItem[] | undefined }
  >({
    mutationFn: async ({ itemId, timeOfDay }) => {
      const { error } = await db()
        .from('routine_items')
        .update({ time_of_day: timeOfDay })
        .eq('id', itemId)
      if (error) throw error
    },
    onMutate: async ({ itemId, timeOfDay }) => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<RoutineItem[]>(queryKey)
      queryClient.setQueryData<RoutineItem[]>(queryKey, (old) =>
        (old ?? []).map((it) => (it.id === itemId ? { ...it, time_of_day: timeOfDay } : it)),
      )
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(queryKey, ctx.previous)
      showToast('Mise à jour impossible. Réessaie.', 'error')
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey })
    },
  })

  const reorderMutation = useMutation<
    void,
    Error,
    RoutineReorderUpdate[],
    { previous: RoutineItem[] | undefined }
  >({
    mutationFn: async (updates) => {
      const { data, error } = await supabase.rpc('cosme_check_reorder_routine', {
        p_items: updates as unknown as Json,
      })
      if (error) throw error
      const res = data as { ok?: boolean } | null
      if (!res || res.ok !== true) throw new Error('reorder_failed')
    },
    onMutate: async (updates) => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<RoutineItem[]>(queryKey)
      queryClient.setQueryData<RoutineItem[]>(queryKey, (old) => {
        const byId = new Map(updates.map((u) => [u.id, u]))
        const next = (old ?? []).map((it) => {
          const u = byId.get(it.id)
          if (!u) return it
          return {
            ...it,
            position: u.position,
            time_of_day: u.time_of_day ?? it.time_of_day,
          }
        })
        return sortItems(next)
      })
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(queryKey, ctx.previous)
      showToast('Mise à jour impossible. Réessaie.', 'error')
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey })
    },
  })

  const addToRoutine = useCallback(
    async (analysisId: string, frequency: RoutineFrequency = 'daily', kind: RoutineItemKind = 'routine') => {
      await addMutation.mutateAsync({ analysisId, frequency, kind })
    },
    [addMutation],
  )

  const setKind = useCallback(
    async (itemId: string, kind: RoutineItemKind) => {
      await kindMutation.mutateAsync({ itemId, kind })
    },
    [kindMutation],
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

  const setTimeOfDay = useCallback(
    async (itemId: string, timeOfDay: RoutineTimeOfDay) => {
      await timeOfDayMutation.mutateAsync({ itemId, timeOfDay })
    },
    [timeOfDayMutation],
  )

  const reorderItems = useCallback(
    async (updates: RoutineReorderUpdate[]) => {
      if (updates.length === 0) return
      await reorderMutation.mutateAsync(updates)
    },
    [reorderMutation],
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
    timeOfDayMutation.error?.message ||
    kindMutation.error?.message ||
    reorderMutation.error?.message ||
    null

  return {
    items,
    isLoading,
    error,
    addToRoutine,
    removeFromRoutine,
    updateFrequency,
    setTimeOfDay,
    setKind,
    reorderItems,
    isInRoutine,
    refresh,
  }
}
