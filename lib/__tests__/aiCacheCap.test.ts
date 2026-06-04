/**
 * capEntries — éviction LRU par namespace (garde les N plus récentes).
 */
import { capEntries } from '@/lib/storage/aiCache'
import type { TimestampedEntry } from '@/lib/storage/cacheCore'

function makeMap(n: number): Record<string, TimestampedEntry<number>> {
  const map: Record<string, TimestampedEntry<number>> = {}
  for (let i = 0; i < n; i++) {
    map[`k${i}`] = { data: i, cachedAt: i } // cachedAt croissant = plus récent
  }
  return map
}

it('ne touche rien si sous le plafond', () => {
  const map = makeMap(10)
  expect(capEntries(map, 200)).toBe(map)
})

it('garde les N plus récentes au-dessus du plafond', () => {
  const map = makeMap(250)
  const capped = capEntries(map, 200)
  const keys = Object.keys(capped)
  expect(keys).toHaveLength(200)
  // Les plus anciennes (cachedAt 0..49) doivent être évincées.
  expect(capped['k0']).toBeUndefined()
  expect(capped['k49']).toBeUndefined()
  expect(capped['k50']).toBeDefined()
  expect(capped['k249']).toBeDefined()
})
