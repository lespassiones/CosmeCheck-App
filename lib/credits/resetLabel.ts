/**
 * Quand les crédits reviennent, dit dans l'heure LOCALE de la personne.
 *
 * Les crédits du jour sont rangés côté base par `CURRENT_DATE` (Postgres en
 * UTC) : la remise à zéro tombe à minuit UTC, soit 1 h (hiver) ou 2 h (été) en
 * France. Écrire « à minuit » serait faux d'une ou deux heures ; on calcule
 * donc l'heure locale de ce minuit UTC. Idem pour la semaine (lundi, comme
 * `date_trunc('week')`) et le mois (le 1er).
 *
 * Logique pure : le décalage horaire est un paramètre (défaut : celui de
 * l'appareil), pour être testable sans dépendre du fuseau de la machine.
 */

/** « à minuit », « à 2 h », « à 5 h 30 » : heure locale de 00:00 UTC. */
export function utcMidnightLocalLabel(offsetMinutes: number): string {
  const minutesOfDay = ((offsetMinutes % 1440) + 1440) % 1440
  const h = Math.floor(minutesOfDay / 60)
  const m = minutesOfDay % 60
  if (h === 0 && m === 0) return 'à minuit'
  if (h === 12 && m === 0) return 'à midi'
  return m === 0 ? `à ${h} h` : `à ${h} h ${String(m).padStart(2, '0')}`
}

/**
 * Suite de « Tes N crédits reviennent … » selon la période de renouvellement,
 * ou `null` si on ne sait pas la dire (période inconnue ou ponctuelle).
 */
export function creditsResetLabel(
  period: string | null | undefined,
  offsetMinutes: number = -new Date().getTimezoneOffset(),
): string | null {
  const at = utcMidnightLocalLabel(offsetMinutes)
  // À l'ouest de Greenwich, minuit UTC tombe encore la VEILLE en heure locale.
  const dayBefore = offsetMinutes < 0
  switch (period) {
    case 'daily':
      return at
    case 'weekly':
      return `${dayBefore ? 'dimanche' : 'lundi'} ${at}`
    case 'monthly':
      return `${dayBefore ? 'le dernier jour du mois' : 'le 1er du mois'} ${at}`
    default:
      return null
  }
}
