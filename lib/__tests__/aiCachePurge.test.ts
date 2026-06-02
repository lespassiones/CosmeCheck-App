/**
 * clearExpiredAiCache — vérifie que la purge périodique fait bien le ménage
 * dans TOUS les namespaces et qu'elle ne crashe jamais (best-effort).
 */

const memory = new Map<string, string>()
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => memory.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => {
      memory.set(k, v)
    }),
    removeItem: jest.fn(async (k: string) => {
      memory.delete(k)
    }),
  },
}))

import {
  AI_CACHE_NAMESPACES,
  aiCacheStorageKey,
  clearExpiredAiCache,
  readAiCache,
  writeAiCache,
} from '@/lib/storage/aiCache'

beforeEach(() => {
  memory.clear()
})

const DAY_MS = 24 * 60 * 60 * 1000

describe('clearExpiredAiCache', () => {
  it('ne crashe pas avec un AsyncStorage vide', async () => {
    await expect(clearExpiredAiCache()).resolves.not.toThrow()
  })

  it('purge les entrées expirées de chaque namespace (selon TTL spécifique)', async () => {
    // ingredient-explain : TTL = 30 jours → 31j = expiré
    await writeAiCache('ingredient-explain', 'aqua', 'old')
    const explainKey = aiCacheStorageKey('ingredient-explain')
    const explainMap = JSON.parse(memory.get(explainKey)!)
    explainMap['aqua'].cachedAt = Date.now() - 31 * DAY_MS
    memory.set(explainKey, JSON.stringify(explainMap))

    // ingredient-exposure : TTL = 1 heure → 2h = expiré
    await writeAiCache('ingredient-exposure', 'aqua', 'old')
    const expoKey = aiCacheStorageKey('ingredient-exposure')
    const expoMap = JSON.parse(memory.get(expoKey)!)
    expoMap['aqua'].cachedAt = Date.now() - 2 * 60 * 60 * 1000
    memory.set(expoKey, JSON.stringify(expoMap))

    // routine-suggest : TTL = 24h → 25h = expiré
    await writeAiCache('routine-suggest', 'hashX', 'old')
    const routineKey = aiCacheStorageKey('routine-suggest')
    const routineMap = JSON.parse(memory.get(routineKey)!)
    routineMap['hashX'].cachedAt = Date.now() - 25 * 60 * 60 * 1000
    memory.set(routineKey, JSON.stringify(routineMap))

    await clearExpiredAiCache()

    // Toutes les entrées doivent être purgées.
    expect(JSON.parse(memory.get(explainKey)!)).toEqual({})
    expect(JSON.parse(memory.get(expoKey)!)).toEqual({})
    expect(JSON.parse(memory.get(routineKey)!)).toEqual({})
  })

  it('GARDE les entrées encore fraîches', async () => {
    await writeAiCache('ingredient-explain', 'aqua', 'fresh')
    await clearExpiredAiCache()
    const got = await readAiCache<string>('ingredient-explain', 'aqua', 30 * DAY_MS)
    expect(got).toBe('fresh')
  })

  it('purge sélective : garde fresh, retire stale dans le MÊME namespace', async () => {
    const ns = 'compare-insights' as const
    await writeAiCache(ns, 'freshKey', 'OK')
    await writeAiCache(ns, 'staleKey', 'KO')

    // Antidater staleKey de 31 jours.
    const key = aiCacheStorageKey(ns)
    const map = JSON.parse(memory.get(key)!)
    map['staleKey'].cachedAt = Date.now() - 31 * DAY_MS
    memory.set(key, JSON.stringify(map))

    await clearExpiredAiCache()

    const finalMap = JSON.parse(memory.get(key)!)
    expect(finalMap['freshKey']).toBeDefined()
    expect(finalMap['staleKey']).toBeUndefined()
  })

  it('ne s écroule pas sur une cache corrompue (JSON invalide)', async () => {
    memory.set(aiCacheStorageKey('routine-suggest'), '{not json')
    await expect(clearExpiredAiCache()).resolves.not.toThrow()
  })

  it('couvre TOUS les namespaces déclarés (anti-régression : si un nouveau est ajouté, le test plante)', async () => {
    // Garde-fou : si quelqu'un ajoute un namespace dans AI_CACHE_NAMESPACES,
    // ce test échoue jusqu'à ce qu'on confirme qu'il est bien géré par la purge.
    expect(AI_CACHE_NAMESPACES).toEqual([
      'ingredient-explain',
      'ingredient-exposure',
      'compare-insights',
      'routine-suggest',
    ])
  })

  it('idempotence : appelée 2× de suite, le 2e appel n écrit rien', async () => {
    await writeAiCache('ingredient-explain', 'aqua', 'fresh')
    const before = memory.get(aiCacheStorageKey('ingredient-explain'))
    await clearExpiredAiCache()
    await clearExpiredAiCache()
    const after = memory.get(aiCacheStorageKey('ingredient-explain'))
    expect(after).toBe(before)
  })
})
