/**
 * cacheCore — utilitaires TTL/parse partagés par session.ts (analyses) et
 * d'autres caches AsyncStorage. Test pur (env node, pas de mock RN).
 */
import { isFresh, parseCacheMap, purgeExpired } from '@/lib/storage/cacheCore'

const TTL = 24 * 60 * 60 * 1000 // 24h
const NOW = 1_700_000_000_000

describe('cacheCore.isFresh', () => {
  it('renvoie true pour une entrée tout juste cachée', () => {
    expect(isFresh(NOW, NOW, TTL)).toBe(true)
  })

  it('renvoie true juste sous le seuil TTL', () => {
    expect(isFresh(NOW - (TTL - 1), NOW, TTL)).toBe(true)
  })

  it('renvoie false pile au seuil TTL (intervalle semi-ouvert)', () => {
    expect(isFresh(NOW - TTL, NOW, TTL)).toBe(false)
  })

  it('renvoie false bien après le TTL', () => {
    expect(isFresh(NOW - 2 * TTL, NOW, TTL)).toBe(false)
  })
})

describe('cacheCore.purgeExpired', () => {
  it('renvoie une map vide et mutated=false si la map d entrée est vide', () => {
    const out = purgeExpired<string>({}, NOW, TTL)
    expect(out.map).toEqual({})
    expect(out.mutated).toBe(false)
  })

  it('garde les entrées fraîches, retire les expirées, signale mutated', () => {
    const map = {
      fresh: { data: 'A', cachedAt: NOW - 1000 },
      stale: { data: 'B', cachedAt: NOW - 2 * TTL },
      borderline: { data: 'C', cachedAt: NOW - TTL }, // exactement au seuil = expiré
    }
    const out = purgeExpired<string>(map, NOW, TTL)
    expect(out.map).toEqual({ fresh: map.fresh })
    expect(out.mutated).toBe(true)
  })

  it('ne mute pas la map d entrée (copie défensive)', () => {
    const map = {
      stale: { data: 'B', cachedAt: NOW - 2 * TTL },
    }
    purgeExpired<string>(map, NOW, TTL)
    expect(map.stale).toBeDefined()
  })

  it('renvoie mutated=false si toutes les entrées sont fraîches', () => {
    const map = {
      a: { data: 1, cachedAt: NOW - 10 },
      b: { data: 2, cachedAt: NOW - 20 },
    }
    const out = purgeExpired<number>(map, NOW, TTL)
    expect(out.mutated).toBe(false)
    expect(Object.keys(out.map)).toHaveLength(2)
  })
})

describe('cacheCore.parseCacheMap', () => {
  it('renvoie {} pour null / undefined / chaîne vide', () => {
    expect(parseCacheMap<string>(null)).toEqual({})
    expect(parseCacheMap<string>(undefined)).toEqual({})
    expect(parseCacheMap<string>('')).toEqual({})
  })

  it('renvoie {} sur JSON corrompu', () => {
    expect(parseCacheMap<string>('{not json')).toEqual({})
  })

  it('renvoie {} sur JSON valide mais non-objet (array, primitive)', () => {
    expect(parseCacheMap<string>('[]')).toEqual({})
    expect(parseCacheMap<string>('42')).toEqual({})
    expect(parseCacheMap<string>('"x"')).toEqual({})
  })

  it('parse correctement une cache map sérialisée', () => {
    const raw = JSON.stringify({
      a: { data: 'X', cachedAt: NOW },
    })
    const map = parseCacheMap<string>(raw)
    expect(map.a?.data).toBe('X')
    expect(map.a?.cachedAt).toBe(NOW)
  })
})
