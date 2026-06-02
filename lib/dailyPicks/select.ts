/**
 * Sélection déterministe des "daily picks" — twin mobile du web.
 *
 * Chaque utilisateur reçoit les MÊMES 10 items pour un jour donné (pas de
 * personnalisation, simple et prédictible). Le "day index" avance d'1 chaque
 * jour, on découpe 10 items consécutifs du catalogue, et on boucle au début
 * quand on atteint la fin.
 *
 * Day index = jours depuis l'epoch UNIX en UTC (= flip à minuit UTC pour tous).
 */

export type PickKind = 'quiz' | 'myth'

export interface DailyPickItem {
  id: string
  kind: PickKind
  order_index: number
  question: string
  options: string[]
  correct_index: number
  reveal: string
  category: string | null
}

const PICKS_PER_DAY = 10

/** Jours UTC depuis 1970-01-01 (entier). */
function daysSinceEpoch(date: Date = new Date()): number {
  return Math.floor(date.getTime() / 86_400_000)
}

/**
 * Sélectionne les 10 items du jour à partir du catalogue trié par `order_index`.
 * Si le catalogue contient ≤ 10 items, on renvoie tout. Sinon on découpe 10
 * items consécutifs en bouclant si nécessaire.
 */
export function pickTodaysItems(
  catalog: DailyPickItem[],
  date: Date = new Date(),
): DailyPickItem[] {
  if (catalog.length === 0) return []
  if (catalog.length <= PICKS_PER_DAY) return catalog

  const day = daysSinceEpoch(date)
  const batches = Math.max(1, Math.ceil(catalog.length / PICKS_PER_DAY))
  const batchIdx = day % batches
  const start = (batchIdx * PICKS_PER_DAY) % catalog.length

  const out: DailyPickItem[] = []
  for (let i = 0; i < PICKS_PER_DAY; i++) {
    out.push(catalog[(start + i) % catalog.length])
  }
  return out
}

/** Clé ISO (YYYY-MM-DD) UTC, utilisée pour le storage local du progrès. */
export function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}
