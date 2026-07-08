/**
 * Seen-store des conflits de routine + notification des NOUVEAUX conflits high.
 *
 * QUOI : mémorise (AsyncStorage) l'ensemble des ids de conflits déjà présentés à
 * l'utilisateur, et calcule à chaque recalcul les conflits `high` inédits. Émet
 * alors un événement `DeviceEventEmitter` que le module notifications écoute
 * pour planifier une alerte locale.
 *
 * POURQUOI : ne réalerter que sur du NOUVEAU (un conflit high déjà vu ne doit
 * pas renotifier à chaque ouverture). Les fonctions pures (`parseSeenState`,
 * `diffNewHighConflicts`) sont séparées de la partie asynchrone pour être
 * testées SANS mock ; seule `reconcileSeenConflicts` touche AsyncStorage +
 * DeviceEventEmitter.
 *
 * Contrat pour le module notifications : s'abonner à NEW_HIGH_CONFLICTS_EVENT,
 * payload `{ conflicts: RoutineConflict[] }`. Le premier run sur un store vide
 * émet (ids=[]) : le throttling du premier run appartient au consommateur.
 */
import type { RoutineConflict } from '@/lib/routine/conflicts'

/** Clé AsyncStorage (fixée par le cahier des charges). */
export const CONFLICTS_SEEN_KEY = 'cosmecheck:conflicts:seen'

/** Événement DeviceEventEmitter pour le module notifications. */
export const NEW_HIGH_CONFLICTS_EVENT = 'cosmecheck:conflicts:new-high'

export type ConflictsSeenState = {
  version: 1
  /** ids de TOUS les conflits vus au dernier run (high + medium + info). */
  ids: string[]
  /** epoch ms du dernier enregistrement. */
  updatedAt: number
}

const EMPTY_STATE: ConflictsSeenState = { version: 1, ids: [], updatedAt: 0 }

/**
 * Parse défensif de l'état persisté. Toute forme invalide (null, JSON corrompu,
 * mauvaise version, champs manquants) => état vide v1.
 */
export function parseSeenState(raw: string | null): ConflictsSeenState {
  if (!raw) return { ...EMPTY_STATE }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ...EMPTY_STATE }
  }
  if (!parsed || typeof parsed !== 'object') return { ...EMPTY_STATE }
  const p = parsed as Record<string, unknown>
  if (p.version !== 1) return { ...EMPTY_STATE }
  const ids = Array.isArray(p.ids)
    ? (p.ids as unknown[]).filter((v): v is string => typeof v === 'string')
    : []
  const updatedAt = typeof p.updatedAt === 'number' ? p.updatedAt : 0
  return { version: 1, ids, updatedAt }
}

/**
 * Conflits `high` du run courant dont l'id n'était PAS dans les ids déjà vus.
 * Les `medium`/`info` ne remontent jamais ici (seul le high notifie).
 */
export function diffNewHighConflicts(
  current: RoutineConflict[],
  seenIds: readonly string[],
): RoutineConflict[] {
  const seen = new Set(seenIds)
  return current.filter((c) => c.severity === 'high' && !seen.has(c.id))
}

/**
 * Réconcilie le store avec l'état courant :
 *   1. lit + parse la clé,
 *   2. calcule les nouveaux conflits high,
 *   3. réécrit l'ensemble des ids courants,
 *   4. si nouveaux high => émet NEW_HIGH_CONFLICTS_EVENT { conflicts },
 *   5. renvoie les nouveaux high.
 */
export async function reconcileSeenConflicts(
  current: RoutineConflict[],
): Promise<RoutineConflict[]> {
  // Imports différés : la partie asynchrone seule dépend de RN / AsyncStorage,
  // ce qui garde les fonctions pures testables sans mock.
  const AsyncStorage = (
    await import('@react-native-async-storage/async-storage')
  ).default
  const { DeviceEventEmitter } = await import('react-native')

  const raw = await AsyncStorage.getItem(CONFLICTS_SEEN_KEY)
  const state = parseSeenState(raw)
  const newHigh = diffNewHighConflicts(current, state.ids)

  const next: ConflictsSeenState = {
    version: 1,
    ids: current.map((c) => c.id),
    updatedAt: Date.now(),
  }
  await AsyncStorage.setItem(CONFLICTS_SEEN_KEY, JSON.stringify(next))

  if (newHigh.length > 0) {
    DeviceEventEmitter.emit(NEW_HIGH_CONFLICTS_EVENT, { conflicts: newHigh })
  }
  return newHigh
}
