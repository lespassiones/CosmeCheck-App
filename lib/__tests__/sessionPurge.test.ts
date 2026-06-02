/**
 * clearExpiredCache — vérifie que la purge des caches d'analyses
 * (response + row) marche et n'écrit que si nécessaire.
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
    multiGet: jest.fn(async (keys: string[]) =>
      keys.map((k) => [k, memory.get(k) ?? null] as [string, string | null]),
    ),
    multiRemove: jest.fn(async (keys: string[]) => {
      for (const k of keys) memory.delete(k)
    }),
  },
}))

import {
  cacheAnalysisRow,
  clearExpiredCache,
  getCachedAnalysisRow,
} from '@/lib/storage/session'
import type { AnalysisRow } from '@/lib/supabase/types'

beforeEach(() => {
  memory.clear()
})

function fakeRow(id: string): AnalysisRow {
  return {
    id,
    user_id: 'u1',
    name: 'fake',
    product_label: null,
    category: null,
    input_text: 'aqua, glycerin',
    result_json: { score: 18, counts: { vert: 5, jaune: 0, orange: 0, rouge: 0 } },
    score: 18,
    created_at: new Date().toISOString(),
    brand: null,
    product_type: null,
    product_description: null,
    promise_source_url: null,
  }
}

const TTL_MS = 24 * 60 * 60 * 1000

describe('clearExpiredCache (session.ts)', () => {
  it('ne crashe pas si AsyncStorage est vide', async () => {
    await expect(clearExpiredCache()).resolves.not.toThrow()
  })

  it('purge un row cache expiré, garde les frais', async () => {
    await cacheAnalysisRow(fakeRow('fresh'))
    await cacheAnalysisRow(fakeRow('stale'))
    // Antidater stale au-delà du TTL.
    const key = 'cosmecheck:analysis_row_cache'
    const map = JSON.parse(memory.get(key)!)
    map['stale'].cachedAt = Date.now() - TTL_MS - 1000
    memory.set(key, JSON.stringify(map))

    await clearExpiredCache()

    expect(await getCachedAnalysisRow('fresh')).not.toBeNull()
    expect(await getCachedAnalysisRow('stale')).toBeNull()
  })

  it('idempotence : sans entrées stale, le 2e appel ne réécrit pas', async () => {
    await cacheAnalysisRow(fakeRow('fresh'))
    const key = 'cosmecheck:analysis_row_cache'
    const before = memory.get(key)
    await clearExpiredCache()
    await clearExpiredCache()
    expect(memory.get(key)).toBe(before)
  })
})
