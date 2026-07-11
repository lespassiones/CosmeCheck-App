/**
 * useCredits — crédits de l'utilisateur avec support des périodes modulables.
 *
 * Les crédits sont stockés par (user_id, day) dans `user_credits` et exposés
 * via la RPC publique `cosme_check_get_credits` (résultat jsonb). Supporte:
 * - Périodes de renouvellement flexibles (daily, weekly, monthly, yearly, one_time)
 * - Surcharges individuelles par utilisateur via user_credits_override
 * - Polling automatique toutes les 10s pour détecter les changements admin
 *
 * Interface consommée par CreditsPill et les écrans qui affichent le solde.
 */

import { useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase/client'
import type { Credits, RenewalPeriod } from '@/lib/supabase/types'
import { useAuth } from '@/hooks/useAuth'

interface UseCreditsReturn {
  credits: Credits | null
  remaining: number
  limit: number
  used: number
  renewalPeriod: RenewalPeriod | null
  renewalIntervalDays: number | null
  isLoading: boolean
  error: string | null
  refresh: () => void
}

export function useCredits(): UseCreditsReturn {
  const { user, isAuthenticated } = useAuth()
  const userId = user?.id ?? null

  const {
    data: credits,
    isLoading,
    error: queryError,
    refetch,
  } = useQuery<Credits | null>({
    queryKey: ['credits', userId],
    enabled: isAuthenticated,
    staleTime: 30 * 1000, // 30 s — réduit pour détecter plus vite les changements admin
    gcTime: 5 * 60 * 1000, // 5 min
    // Polling 60s pour capter les changements admin (rares). Le débit de crédit
    // est déjà reflété en temps réel côté feature (invalidation sur retour 429 /
    // event), donc pas besoin de sonder agressivement. `refetchInterval` est géré
    // PAR QUERY par React Query (pas par instance de hook) : CreditsPill étant
    // monté sur chaque onglet, un setInterval par instance multipliait le trafic
    // de fond par 3-4x sur cosme_check_get_credits.
    refetchInterval: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('cosme_check_get_credits')
      if (error) throw error
      return (data as unknown as Credits) ?? null
    },
  })

  const refresh = useCallback(() => {
    void refetch()
  }, [refetch])

  const remaining = useMemo(() => credits?.remaining ?? 0, [credits?.remaining])
  const limit = useMemo(() => credits?.limit ?? 0, [credits?.limit])
  const used = useMemo(() => credits?.used ?? 0, [credits?.used])
  const renewalPeriod = useMemo(() => (credits?.renewal_period as RenewalPeriod) ?? null, [credits?.renewal_period])
  const renewalIntervalDays = useMemo(() => credits?.renewal_interval_days ?? null, [credits?.renewal_interval_days])

  return {
    credits: credits ?? null,
    remaining,
    limit,
    used,
    renewalPeriod,
    renewalIntervalDays,
    isLoading,
    error: queryError instanceof Error ? queryError.message : null,
    refresh,
  }
}
