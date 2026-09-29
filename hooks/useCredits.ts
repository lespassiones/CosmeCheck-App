/**
 * useCredits — crédits de l'utilisateur avec support des périodes modulables.
 *
 * Les crédits sont stockés par (user_id, day) dans `user_credits` et exposés
 * via la RPC publique `cosme_check_get_credits` (résultat jsonb). Supporte:
 * - Périodes de renouvellement flexibles (daily, weekly, monthly, yearly, one_time)
 * - Surcharges individuelles par utilisateur via user_credits_override
 * - Relevé périodique (60 s) fait par UN SEUL observateur pour toute l'app :
 *   `BackgroundPollers` (monté à la racine), pas par chaque lecteur.
 *
 * Interface consommée par CreditsPill et les écrans qui affichent le solde.
 */

import { useCallback, useMemo } from 'react'
import { queryOptions, useQuery } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase/client'
import type { Credits, RenewalPeriod } from '@/lib/supabase/types'
import { useAuth } from '@/hooks/useAuth'

interface UseCreditsReturn {
  credits: Credits | null
  remaining: number
  limit: number
  used: number
  /** Crédits bonus (non renouvelables) inclus dans `remaining`. */
  bonus: number
  renewalPeriod: RenewalPeriod | null
  renewalIntervalDays: number | null
  isLoading: boolean
  error: string | null
  refresh: () => void
}

/**
 * Requête du solde, partagée par tous les lecteurs. SANS `refetchInterval` :
 * React Query gère l'intervalle PAR OBSERVATEUR (et non par requête), donc
 * chaque pastille / écran qui lisait les crédits relançait son propre minuteur
 * de 60 s. Le relevé périodique est fait une seule fois par `BackgroundPollers`.
 */
export function creditsQueryOptions(userId: string | null) {
  return queryOptions<Credits | null>({
    queryKey: ['credits', userId],
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('cosme_check_get_credits')
      if (error) throw error
      return (data as unknown as Credits) ?? null
    },
  })
}

/** Intervalle du relevé unique (changements admin, rares ; le débit d'un crédit est invalidé en direct). */
export const CREDITS_POLL_MS = 60 * 1000

export function useCredits(): UseCreditsReturn {
  const { user, isAuthenticated } = useAuth()
  const userId = user?.id ?? null

  const {
    data: credits,
    isLoading,
    error: queryError,
    refetch,
  } = useQuery({ ...creditsQueryOptions(userId), enabled: isAuthenticated })

  const refresh = useCallback(() => {
    void refetch()
  }, [refetch])

  const remaining = useMemo(() => credits?.remaining ?? 0, [credits?.remaining])
  const limit = useMemo(() => credits?.limit ?? 0, [credits?.limit])
  const used = useMemo(() => credits?.used ?? 0, [credits?.used])
  const bonus = useMemo(() => credits?.bonus ?? 0, [credits?.bonus])
  const renewalPeriod = useMemo(() => (credits?.renewal_period as RenewalPeriod) ?? null, [credits?.renewal_period])
  const renewalIntervalDays = useMemo(() => credits?.renewal_interval_days ?? null, [credits?.renewal_interval_days])

  return {
    credits: credits ?? null,
    remaining,
    limit,
    used,
    bonus,
    renewalPeriod,
    renewalIntervalDays,
    isLoading,
    error: queryError instanceof Error ? queryError.message : null,
    refresh,
  }
}
