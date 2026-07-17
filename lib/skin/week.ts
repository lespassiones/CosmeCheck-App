/**
 * Semaine ISO-8601 : module UNIQUE partagé par le score de peau (bilans hebdo),
 * les notifications (rappel de bilan) et les Pépites de la semaine (sélection hebdo).
 *
 * Convention : la semaine est déterminée par la date CALENDAIRE LOCALE de
 * l'utilisateur (un bilan fait dimanche 23h30 heure locale compte pour cette
 * semaine-là), mais le calcul ISO lui-même se fait en espace UTC (astuce du
 * jeudi) pour être insensible aux changements d'heure (DST).
 *
 * NE PAS dupliquer : toute logique "semaine" du chantier rétention passe ici.
 */

export interface IsoWeekParts {
  year: number
  week: number
}

/**
 * Composants ISO {année, semaine} d'une date (année ISO, pas année civile :
 * le 1er janvier peut appartenir à la dernière semaine de l'année précédente,
 * et fin décembre à la semaine 1 de l'année suivante).
 */
export function isoWeekParts(date: Date): IsoWeekParts {
  // Date calendaire LOCALE projetée en UTC (évite les effets DST).
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = (d.getUTCDay() + 6) % 7 // 0 = lundi ... 6 = dimanche
  // Astuce du jeudi : la semaine ISO d'une date est celle de son jeudi.
  d.setUTCDate(d.getUTCDate() - dayNum + 3)
  const isoYear = d.getUTCFullYear()
  // Le 4 janvier est toujours en semaine 1 ; on prend le jeudi de sa semaine.
  const jan4 = new Date(Date.UTC(isoYear, 0, 4))
  const jan4DayNum = (jan4.getUTCDay() + 6) % 7
  const week1Thursday = new Date(Date.UTC(isoYear, 0, 4 - jan4DayNum + 3))
  const week = 1 + Math.round((d.getTime() - week1Thursday.getTime()) / (7 * 86_400_000))
  return { year: isoYear, week }
}

/** Clé de semaine ISO, ex. '2026-W28'. Stable, triable, utilisée en DB (skin_checkins.week_key). */
export function isoWeekKey(date: Date = new Date()): string {
  const { year, week } = isoWeekParts(date)
  return `${year}-W${String(week).padStart(2, '0')}`
}

/**
 * Clé de JOUR calendaire LOCAL, ex. '2026-07-17'. Bascule à minuit heure locale
 * (même convention "date calendaire locale" que la semaine ISO ci-dessus).
 * Utilisée par les Pépites (rotation QUOTIDIENNE déterministe).
 */
export function localDayKey(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Jour ISO 1..7 (1 = lundi, 7 = dimanche) en calendrier local. */
export function isoWeekday(date: Date): number {
  return ((date.getDay() + 6) % 7) + 1
}

/** Lundi 00:00 (heure locale) de la semaine ISO de la date. */
export function startOfIsoWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const dayNum = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - dayNum)
  return d
}
