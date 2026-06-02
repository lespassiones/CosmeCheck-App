/**
 * barcodeCache — wrapper Deno.openKv() avec fallback gracieux.
 *
 * Tests éphémères : on simule un `Deno.openKv` via global, on vérifie le
 * round-trip et la dégradation silencieuse si KV indisponible.
 *
 * On charge le module via jest.isolateModules pour reset le module-state
 * (cachedKv, kvInitFailed) entre les scénarios — essentiel sinon le module
 * "se souvient" d'avoir échoué et tous les tests suivants partent en miss.
 */

type Kv = {
  get: (k: unknown[]) => Promise<{ value: unknown }>
  set: (k: unknown[], v: unknown, opts: { expireIn: number }) => Promise<unknown>
}

function freshModule() {
  let mod: typeof import('../../supabase/functions/product-by-barcode/lib/barcodeCache')
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('../../supabase/functions/product-by-barcode/lib/barcodeCache')
  })
  return mod!
}

beforeEach(() => {
  // Reset les mocks globaux entre tests.
  delete (globalThis as { Deno?: unknown }).Deno
})

describe('barcodeCache — Deno.openKv indisponible', () => {
  it('getCachedBarcodeResult retourne null sans crasher', async () => {
    const { getCachedBarcodeResult } = freshModule()
    await expect(getCachedBarcodeResult('1234567890123')).resolves.toBeNull()
  })

  it('cacheBarcodeResult ne throw pas', async () => {
    const { cacheBarcodeResult } = freshModule()
    await expect(cacheBarcodeResult('1234567890123', { ok: 1 })).resolves.toBeUndefined()
  })
})

describe('barcodeCache — Deno.openKv qui throw à l init', () => {
  it('getCachedBarcodeResult dégrade silencieusement', async () => {
    ;(globalThis as { Deno?: unknown }).Deno = {
      openKv: () => {
        throw new Error('permission denied')
      },
    }
    const { getCachedBarcodeResult } = freshModule()
    await expect(getCachedBarcodeResult('abc')).resolves.toBeNull()
  })
})

describe('barcodeCache — Deno.openKv fonctionnel (round-trip)', () => {
  it('write puis read même clé → retourne la valeur', async () => {
    const store = new Map<string, unknown>()
    const kv: Kv = {
      get: async (k) => ({ value: store.get(JSON.stringify(k)) ?? null }),
      set: async (k, v) => {
        store.set(JSON.stringify(k), v)
      },
    }
    ;(globalThis as { Deno?: unknown }).Deno = { openKv: async () => kv }

    const { cacheBarcodeResult, getCachedBarcodeResult } = freshModule()
    const payload = { found: true, brand: 'X' }
    await cacheBarcodeResult('111', payload)
    const got = await getCachedBarcodeResult('111')
    expect(got).toEqual(payload)
  })

  it('write avec TTL 12h passé à expireIn', async () => {
    const calls: { key: unknown[]; opts: { expireIn: number } }[] = []
    const kv: Kv = {
      get: async () => ({ value: null }),
      set: async (k, _v, opts) => {
        calls.push({ key: k, opts })
      },
    }
    ;(globalThis as { Deno?: unknown }).Deno = { openKv: async () => kv }

    const { cacheBarcodeResult, BARCODE_CACHE_TTL_MS } = freshModule()
    await cacheBarcodeResult('222', { x: 1 })
    expect(calls).toHaveLength(1)
    expect(calls[0].opts.expireIn).toBe(BARCODE_CACHE_TTL_MS)
    expect(BARCODE_CACHE_TTL_MS).toBe(12 * 60 * 60 * 1000)
  })

  it('isole les EANs (clé différente)', async () => {
    const store = new Map<string, unknown>()
    const kv: Kv = {
      get: async (k) => ({ value: store.get(JSON.stringify(k)) ?? null }),
      set: async (k, v) => {
        store.set(JSON.stringify(k), v)
      },
    }
    ;(globalThis as { Deno?: unknown }).Deno = { openKv: async () => kv }

    const { cacheBarcodeResult, getCachedBarcodeResult } = freshModule()
    await cacheBarcodeResult('111', 'A')
    await cacheBarcodeResult('222', 'B')
    expect(await getCachedBarcodeResult('111')).toBe('A')
    expect(await getCachedBarcodeResult('222')).toBe('B')
  })

  it('get qui throw → null (jamais propage)', async () => {
    const kv: Kv = {
      get: async () => {
        throw new Error('KV exploded')
      },
      set: async () => {},
    }
    ;(globalThis as { Deno?: unknown }).Deno = { openKv: async () => kv }

    const { getCachedBarcodeResult } = freshModule()
    await expect(getCachedBarcodeResult('boom')).resolves.toBeNull()
  })

  it('set qui throw → ne propage pas (cacheBarcodeResult swallow)', async () => {
    const kv: Kv = {
      get: async () => ({ value: null }),
      set: async () => {
        throw new Error('KV write failed')
      },
    }
    ;(globalThis as { Deno?: unknown }).Deno = { openKv: async () => kv }

    const { cacheBarcodeResult } = freshModule()
    await expect(cacheBarcodeResult('boom', { x: 1 })).resolves.toBeUndefined()
  })
})
