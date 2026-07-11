/**
 * queryPersist — predicate de persistance des queryKeys react-query.
 * Test pur (env node).
 */
import {
  QUERY_PERSIST_BUSTER,
  QUERY_PERSIST_KEY,
  QUERY_PERSIST_MAX_AGE_MS,
  shouldDehydrateQuery,
  shouldPersistQueryKey,
} from '@/lib/storage/queryPersist'

describe('shouldPersistQueryKey', () => {
  it('persiste les clés stables (routine, dashboard, history, ingredient, dailyPicks)', () => {
    expect(shouldPersistQueryKey(['routine', 'u1'])).toBe(true)
    expect(shouldPersistQueryKey(['dashboard', 'last-analysis', 'u1'])).toBe(true)
    expect(shouldPersistQueryKey(['history', 'u1'])).toBe(true)
    expect(shouldPersistQueryKey(['ingredient', 'aqua'])).toBe(true)
    expect(shouldPersistQueryKey(['dailyPicks', '2025-06-02'])).toBe(true)
  })

  it('exclut le profil (pilote la porte onboarding → jamais servi périmé)', () => {
    expect(shouldPersistQueryKey(['profile', 'u1'])).toBe(false)
  })

  it('exclut les crédits (changent à chaque analyse)', () => {
    expect(shouldPersistQueryKey(['credits', 'u1'])).toBe(false)
    expect(shouldPersistQueryKey(['credits'])).toBe(false)
  })

  it('exclut les réponses IA (gérées par leur propre cache TTL)', () => {
    expect(shouldPersistQueryKey(['ingredient-explain', 'aqua'])).toBe(false)
    expect(shouldPersistQueryKey(['compare-insights', 'a', 'b'])).toBe(false)
    expect(shouldPersistQueryKey(['routine-suggest', 'hash'])).toBe(false)
  })

  it('exclut la recherche catalogue (transient, staleTime 60s)', () => {
    expect(shouldPersistQueryKey(['catalog-search', 'garnier', 0])).toBe(false)
  })

  it('exclut les caches transients alternatives / eanAnalysis / productByEan', () => {
    expect(shouldPersistQueryKey(['alternatives', '3600541234567', 0])).toBe(false)
    expect(shouldPersistQueryKey(['eanAnalysis', '3600541234567'])).toBe(false)
    expect(shouldPersistQueryKey(['productByEan', '3600541234567'])).toBe(false)
  })

  it('exclut la config app (flags + maintenance, toujours frais)', () => {
    expect(shouldPersistQueryKey(['appConfig'])).toBe(false)
  })

  it('refuse les queryKey non-array / vides / non-string', () => {
    expect(shouldPersistQueryKey([])).toBe(false)
    expect(shouldPersistQueryKey(null)).toBe(false)
    expect(shouldPersistQueryKey(undefined)).toBe(false)
    expect(shouldPersistQueryKey('plain')).toBe(false)
    expect(shouldPersistQueryKey([42])).toBe(false)
  })
})

describe('shouldDehydrateQuery', () => {
  function fakeQuery(queryKey: unknown[], status: 'success' | 'pending' | 'error') {
    // On ne charge pas le type Query complet : ce qui compte ce sont
    // queryKey + state.status. Le cast `as never` masque le reste.
    return { queryKey, state: { status } } as never
  }

  it('persiste une query success avec une clé autorisée', () => {
    expect(shouldDehydrateQuery(fakeQuery(['routine', 'u1'], 'success'))).toBe(true)
  })

  it('refuse une query en erreur (même clé autorisée)', () => {
    expect(shouldDehydrateQuery(fakeQuery(['routine', 'u1'], 'error'))).toBe(false)
  })

  it('refuse une query en cours (pending)', () => {
    expect(shouldDehydrateQuery(fakeQuery(['routine', 'u1'], 'pending'))).toBe(false)
  })

  it('refuse une query success sur la blacklist', () => {
    expect(shouldDehydrateQuery(fakeQuery(['credits', 'u1'], 'success'))).toBe(false)
  })
})

describe('constantes', () => {
  it('expose des valeurs stables (buster, key, TTL)', () => {
    expect(typeof QUERY_PERSIST_BUSTER).toBe('string')
    expect(QUERY_PERSIST_BUSTER.length).toBeGreaterThan(0)
    expect(QUERY_PERSIST_KEY).toMatch(/^cosmecheck:/)
    expect(QUERY_PERSIST_MAX_AGE_MS).toBeGreaterThan(0)
  })
})
