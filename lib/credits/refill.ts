/**
 * Textes de recharge des crédits (écran Profil, 28/09/2026) : fin de phrase du
 * solde et heure LOCALE de la prochaine recharge. Purs, testés dans
 * lib/__tests__/profileSummary.test.ts.
 */
import type { RenewalPeriod } from '@/lib/supabase/types'

/**
 * Sépare le solde affiché : quota restant de la PÉRIODE (jauge « 3 sur 5 ») et
 * crédits BONUS (ponctuels, inclus dans `remaining` par la RPC). Sans champ
 * `bonus` (ancienne RPC), l'excédent au-delà de la limite est traité en bonus.
 */
export function splitCredits(c: {
  remaining: number
  limit: number
  bonus?: number | null
}): { periodLeft: number; bonus: number } {
  const bonus = Math.max(0, c.bonus ?? c.remaining - c.limit)
  const periodLeft = Math.min(Math.max(0, c.remaining - bonus), Math.max(0, c.limit))
  return { periodLeft, bonus }
}

/** Fin de phrase du solde : « 3 sur 5 aujourd'hui », « … cette semaine »… */
export function creditsPeriodLabel(period: RenewalPeriod | null): string {
  switch (period) {
    case 'weekly':
      return 'cette semaine'
    case 'monthly':
      return 'ce mois-ci'
    case 'yearly':
      return 'cette année'
    case 'one_time':
      return 'au total'
    default:
      // Absent = quota quotidien (comportement historique de la RPC).
      return "aujourd'hui"
  }
}

/** Prochain minuit UTC : le quota quotidien bascule à ce moment (CURRENT_DATE Postgres, UTC). */
export function nextUtcMidnight(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
}

/**
 * « Se rechargent à 2 h » : heure LOCALE du prochain minuit UTC (en France,
 * 1 h l'hiver, 2 h l'été : écrire « à minuit » serait faux). null = pas de recharge.
 */
export function creditsRefillLabel(period: RenewalPeriod | null, now: Date = new Date()): string | null {
  switch (period) {
    case 'weekly':
      return 'Se rechargent chaque semaine'
    case 'monthly':
      return 'Se rechargent chaque mois'
    case 'yearly':
      return 'Se rechargent chaque année'
    case 'one_time':
      return null
    default: {
      const at = nextUtcMidnight(now)
      const h = at.getHours()
      const m = at.getMinutes()
      if (h === 0 && m === 0) return 'Se rechargent à minuit'
      return `Se rechargent à ${h} h${m ? String(m).padStart(2, '0') : ''}`
    }
  }
}
