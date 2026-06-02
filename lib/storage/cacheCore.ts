/**
 * Cache Core — utilitaires PURS (testables en env node, sans AsyncStorage).
 *
 * Sépare la mécanique TTL/purge des wrappers AsyncStorage de `session.ts`,
 * pour permettre des tests unitaires sans monter de mock Storage RN.
 */

export interface TimestampedEntry<T> {
  data: T
  cachedAt: number
}

/** Une entrée est fraîche tant que `now - cachedAt < ttlMs`. */
export function isFresh(cachedAt: number, now: number, ttlMs: number): boolean {
  return now - cachedAt < ttlMs
}

/**
 * Purge les entrées expirées d'une map cache. Renvoie un objet avec la `map`
 * potentiellement réduite et un flag `mutated` pour décider d'un re-write
 * éventuel. La map d'entrée n'est PAS mutée (copie défensive).
 */
export function purgeExpired<T>(
  map: Record<string, TimestampedEntry<T>>,
  now: number,
  ttlMs: number,
): { map: Record<string, TimestampedEntry<T>>; mutated: boolean } {
  const next: Record<string, TimestampedEntry<T>> = {}
  let mutated = false
  for (const id of Object.keys(map)) {
    if (isFresh(map[id].cachedAt, now, ttlMs)) {
      next[id] = map[id]
    } else {
      mutated = true
    }
  }
  return { map: next, mutated }
}

/** Parse un JSON brut comme une cache map. Vide / corrompue → `{}`. */
export function parseCacheMap<T>(raw: string | null | undefined): Record<string, TimestampedEntry<T>> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Record<string, TimestampedEntry<T>>
  } catch {
    return {}
  }
}
