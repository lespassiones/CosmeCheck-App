/**
 * useCredits — crédits quotidiens de l'utilisateur.
 *
 * Les crédits sont stockés par (user_id, day) dans `user_credits` et exposés
 * via la RPC publique `cosme_check_get_credits` (résultat jsonb). On ne charge
 * que si l'utilisateur est authentifié.
 *
 * Interface consommée par CreditsPill et les écrans qui affichent le solde.
 */

import { useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase/client'
import type { Credits } from '@/lib/supabase/types'
import { useAuth } from '@/hooks/useAuth'

interface UseCreditsReturn {
  credits: Credits | null
  remaining: number
  limit: number
  used: number
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
    staleTime: 60 * 1000, // 60 s — les crédits changent rarement
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

  return {
    credits: credits ?? null,
    remaining,
    limit,
    used,
    isLoading,
    error: queryError instanceof Error ? queryError.message : null,
    refresh,
  }
}
