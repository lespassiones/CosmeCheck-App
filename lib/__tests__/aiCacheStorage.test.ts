/**
 * aiCache — round-trip writeAiCache / readAiCache contre un AsyncStorage
 * mocké en mémoire. Test éphémère : prouve que la pipeline complète
 * (sérialisation, TTL, namespacing) fonctionne.
 */

// Mock AsyncStorage AVANT d'importer le module testé.
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
  aiCacheStorageKey,
  readAiCache,
  writeAiCache,
} from '@/lib/storage/aiCache'

beforeEach(() => {
  memory.clear()
})

describe('aiCache round-trip', () => {
  it('writeAiCache puis readAiCache retourne la valeur (cache HIT)', async () => {
    await writeAiCache<string>('ingredient-explain', 'aqua', 'Aqua = eau purifiée.')
    const got = await readAiCache<string>('ingredient-explain', 'aqua', 60_000)
    expect(got).toBe('Aqua = eau purifiée.')
  })

  it('readAiCache renvoie null si la clé n est pas écrite (cache MISS)', async () => {
    const got = await readAiCache<string>('ingredient-explain', 'unknown', 60_000)
    expect(got).toBeNull()
  })

  it('readAiCache renvoie null si l entrée est expirée (TTL court)', async () => {
    await writeAiCache<string>('compare-insights', 'a__b', 'compare body')
    // TTL = 0 → toute entrée est expirée.
    const got = await readAiCache<string>('compare-insights', 'a__b', 0)
    expect(got).toBeNull()
  })

  it('isole les namespaces (même clé, deux namespaces)', async () => {
    await writeAiCache<string>('ingredient-explain', 'X', 'explainX')
    await writeAiCache<string>('ingredient-exposure', 'X', 'exposureX')
    const e1 = await readAiCache<string>('ingredient-explain', 'X', 60_000)
    const e2 = await readAiCache<string>('ingredient-exposure', 'X', 60_000)
    expect(e1).toBe('explainX')
    expect(e2).toBe('exposureX')
    // Vérifie que ce sont bien deux clés AsyncStorage distinctes.
    expect(memory.has(aiCacheStorageKey('ingredient-explain'))).toBe(true)
    expect(memory.has(aiCacheStorageKey('ingredient-exposure'))).toBe(true)
  })

  it('writeAiCache écrase une entrée existante avec le même namespace+clé', async () => {
    await writeAiCache<string>('routine-suggest', 'hashA', 'v1')
    await writeAiCache<string>('routine-suggest', 'hashA', 'v2')
    const got = await readAiCache<string>('routine-suggest', 'hashA', 60_000)
    expect(got).toBe('v2')
  })

  it('readAiCache retourne null si AsyncStorage corrompu (JSON invalide)', async () => {
    memory.set(aiCacheStorageKey('compare-insights'), '{not-json')
    const got = await readAiCache<string>('compare-insights', 'any', 60_000)
    expect(got).toBeNull()
  })

  it('stocke des structures objet et les recharge identiques', async () => {
    type Insights = { portraitA: string; portraitB: string }
    const payload: Insights = { portraitA: 'A', portraitB: 'B' }
    await writeAiCache<Insights>('compare-insights', 'p1__p2', payload)
    const got = await readAiCache<Insights>('compare-insights', 'p1__p2', 60_000)
    expect(got).toEqual(payload)
  })
})
