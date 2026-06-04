/**
 * clearUserScopedCaches — purge des caches au sign-out.
 * Doit retirer les clés `cosmecheck:*` SAUF le flag pré-onboarding, et ne pas
 * toucher aux clés étrangères ni aux clés `cw:` (progrès quiz, device-level).
 */

const memory = new Map<string, string>()
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getAllKeys: jest.fn(async () => Array.from(memory.keys())),
    multiRemove: jest.fn(async (keys: string[]) => {
      for (const k of keys) memory.delete(k)
    }),
    getItem: jest.fn(async (k: string) => memory.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => {
      memory.set(k, v)
    }),
  },
}))

import { clearUserScopedCaches } from '@/lib/storage/clearUserScopedCaches'

beforeEach(() => {
  memory.clear()
})

it('purge les clés cosmecheck:* mais conserve preonboarding + clés étrangères', async () => {
  memory.set('cosmecheck:analysis_cache', '{}')
  memory.set('cosmecheck:ai-cache:ingredient-explain', '{}')
  memory.set('cosmecheck:react-query-cache', '{}')
  memory.set('cosmecheck:product_image_cache', '{}')
  memory.set('cosmecheck:preonboarding_done', 'true') // doit rester
  memory.set('cw:dailyPicks:2026-06-04', '{}') // doit rester
  memory.set('autre_app_key', 'x') // doit rester

  await clearUserScopedCaches()

  const remaining = Array.from(memory.keys()).sort()
  expect(remaining).toEqual(
    ['autre_app_key', 'cosmecheck:preonboarding_done', 'cw:dailyPicks:2026-06-04'].sort(),
  )
})

it('ne plante pas si le storage est vide', async () => {
  await expect(clearUserScopedCaches()).resolves.toBeUndefined()
})
