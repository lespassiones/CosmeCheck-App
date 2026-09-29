/**
 * Plafond par défaut des requêtes Supabase : plus aucun chargement sans fin
 * (Android n'a aucun délai de lecture), sans toucher aux appels qui ont déjà
 * le leur ni à l'authentification.
 */
import {
  FUNCTIONS_TIMEOUT_MS,
  LOGOUT_TIMEOUT_MS,
  REST_TIMEOUT_MS,
  defaultTimeoutFor,
  withDefaultTimeout,
} from '../supabase/fetchTimeout'

const BASE = 'https://rogesnduejmqpxolhbif.supabase.co'

describe('defaultTimeoutFor', () => {
  it('fonctions 60 s, base 30 s, auth et stockage intacts', () => {
    expect(defaultTimeoutFor(`${BASE}/functions/v1/product-by-barcode`)).toBe(FUNCTIONS_TIMEOUT_MS)
    expect(defaultTimeoutFor(`${BASE}/rest/v1/rpc/cosme_check_get_credits`)).toBe(REST_TIMEOUT_MS)
    expect(defaultTimeoutFor(`${BASE}/auth/v1/token?grant_type=refresh_token`)).toBeNull()
    expect(defaultTimeoutFor(`${BASE}/auth/v1/logout?scope=global`)).toBe(LOGOUT_TIMEOUT_MS)
    expect(defaultTimeoutFor(`${BASE}/storage/v1/object/photos/a.jpg`)).toBeNull()
  })
})

describe('withDefaultTimeout', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  /** fetch qui ne répond jamais, sauf annulation. */
  const hangingFetch = jest.fn((_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('AbortError')))
    }),
  )

  it('coupe une Edge Function muette au bout du plafond', async () => {
    const f = withDefaultTimeout(hangingFetch)
    const p = f(`${BASE}/functions/v1/personal-insights`, { method: 'POST' })
    jest.advanceTimersByTime(FUNCTIONS_TIMEOUT_MS - 1)
    let settled = false
    p.catch(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)
    jest.advanceTimersByTime(1)
    await expect(p).rejects.toThrow('AbortError')
  })

  it("respecte le signal d'un appel qui a déjà son délai", () => {
    const own = new AbortController()
    const base = jest.fn(() => Promise.resolve({} as Response))
    void withDefaultTimeout(base)(`${BASE}/functions/v1/analyser`, { signal: own.signal })
    expect((base.mock.calls[0] as unknown[])[1]).toEqual({ signal: own.signal })
  })

  it("ne coupe jamais l'authentification", () => {
    const base = jest.fn(() => Promise.resolve({} as Response))
    void withDefaultTimeout(base)(`${BASE}/auth/v1/user`, { method: 'GET' })
    expect((base.mock.calls[0] as unknown[])[1]).toEqual({ method: 'GET' })
  })
})
