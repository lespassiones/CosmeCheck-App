/**
 * useCreditTiers : quotas de crédits IA par formule, lus dans
 * `cosme_check.credit_tiers` (lecture publique, aucune écriture).
 *
 * Le tableau comparatif du paywall s'en sert pour afficher les VRAIS chiffres
 * (5 par jour en gratuit, 50 par jour en Premium le 28/09/2026) au lieu d'un
 * nombre écrit en dur qui dérive dès que l'admin change le réglage (l'ancienne
 * page /offre annonçait « 100 crédits/mois » ; retirée le 28/09/2026, /offre
 * rend désormais ce même paywall).
 */

import { useQuery } from '@tanstack/react-query'

import { db } from '@/lib/supabase/client'

export interface CreditTier {
  tier: 'free' | 'premium'
  amount: number
  period: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'one_time' | string
}

interface TiersQuery {
  select: (cols: string) => PromiseLike<{ data: unknown; error: unknown }>
}

export function useCreditTiers() {
  return useQuery({
    queryKey: ['creditTiers'],
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<Record<'free' | 'premium', CreditTier | null>> => {
      const { data, error } = await (db().from('credit_tiers' as never) as unknown as TiersQuery).select(
        'tier, credit_amount, renewal_period',
      )
      if (error || !Array.isArray(data)) throw error ?? new Error('credit_tiers illisible')
      const rows = data as { tier: string; credit_amount: number; renewal_period: string }[]
      const pick = (t: 'free' | 'premium'): CreditTier | null => {
        const r = rows.find((x) => x.tier === t)
        return r ? { tier: t, amount: r.credit_amount, period: r.renewal_period } : null
      }
      return { free: pick('free'), premium: pick('premium') }
    },
  })
}

/** « par jour », « par mois »… pour la période de renouvellement. */
export function periodLabel(period: string): string {
  switch (period) {
    case 'daily':
      return 'par jour'
    case 'weekly':
      return 'par semaine'
    case 'monthly':
      return 'par mois'
    case 'yearly':
      return 'par an'
    default:
      return ''
  }
}
