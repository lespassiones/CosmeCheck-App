/**
 * aiCache — helpers PURS (clés stables, hash déterministe).
 *
 * Les wrappers AsyncStorage `readAiCache` / `writeAiCache` sont testés
 * indirectement via le typecheck + tests d'intégration éphémères.
 */
import {
  aiCacheStorageKey,
  compareInsightsKey,
  routineSuggestKey,
  stableHash,
  TTL_COMPARE_INSIGHTS_MS,
  TTL_INGREDIENT_EXPLAIN_MS,
  TTL_INGREDIENT_EXPOSURE_MS,
  TTL_ROUTINE_SUGGEST_MS,
} from '@/lib/storage/aiCache'

describe('aiCacheStorageKey', () => {
  it('préfixe le namespace pour isoler les caches', () => {
    expect(aiCacheStorageKey('ingredient-explain')).toBe(
      'cosmecheck:ai-cache:ingredient-explain',
    )
    expect(aiCacheStorageKey('compare-insights')).toBe(
      'cosmecheck:ai-cache:compare-insights',
    )
  })
})

describe('stableHash', () => {
  it('renvoie une chaîne hex non vide', () => {
    const h = stableHash('hello')
    expect(typeof h).toBe('string')
    expect(h).toMatch(/^[0-9a-f]+$/)
    expect(h.length).toBeGreaterThan(0)
  })

  it('est déterministe (même input → même hash)', () => {
    expect(stableHash('aqua:daily|talc:weekly')).toBe(stableHash('aqua:daily|talc:weekly'))
  })

  it('distingue des inputs différents', () => {
    expect(stableHash('a')).not.toBe(stableHash('b'))
    expect(stableHash('aqua:daily')).not.toBe(stableHash('aqua:weekly'))
  })

  it('gère la chaîne vide', () => {
    expect(stableHash('')).toMatch(/^[0-9a-f]+$/)
  })
})

describe('routineSuggestKey', () => {
  it('produit la même clé quel que soit l ordre des produits', () => {
    const a = [
      { id: 'p1', frequency: 'daily' },
      { id: 'p2', frequency: 'weekly' },
    ]
    const b = [
      { id: 'p2', frequency: 'weekly' },
      { id: 'p1', frequency: 'daily' },
    ]
    expect(routineSuggestKey(a)).toBe(routineSuggestKey(b))
  })

  it('change si la fréquence d un produit change', () => {
    const before = [{ id: 'p1', frequency: 'daily' }]
    const after = [{ id: 'p1', frequency: 'weekly' }]
    expect(routineSuggestKey(before)).not.toBe(routineSuggestKey(after))
  })

  it('change si un produit est ajouté', () => {
    const before = [{ id: 'p1', frequency: 'daily' }]
    const after = [
      { id: 'p1', frequency: 'daily' },
      { id: 'p2', frequency: 'daily' },
    ]
    expect(routineSuggestKey(before)).not.toBe(routineSuggestKey(after))
  })

  it('gère une routine vide', () => {
    expect(routineSuggestKey([])).toMatch(/^[0-9a-f]+$/)
  })
})

describe('compareInsightsKey', () => {
  it('encode A→B (ordre significatif)', () => {
    expect(compareInsightsKey('a', 'b')).toBe('v9__a__b')
    expect(compareInsightsKey('a', 'b')).not.toBe(compareInsightsKey('b', 'a'))
  })
})

describe('TTL constants', () => {
  it('ingredient-explain : 30 jours (réponse stable)', () => {
    expect(TTL_INGREDIENT_EXPLAIN_MS).toBe(30 * 24 * 60 * 60 * 1000)
  })

  it('ingredient-exposure : 1h (dépend des analyses user)', () => {
    expect(TTL_INGREDIENT_EXPOSURE_MS).toBe(60 * 60 * 1000)
  })

  it('compare-insights : 30 jours (stable pour un couple)', () => {
    expect(TTL_COMPARE_INSIGHTS_MS).toBe(30 * 24 * 60 * 60 * 1000)
  })

  it('routine-suggest : 24h (rafraîchissable quotidiennement)', () => {
    expect(TTL_ROUTINE_SUGGEST_MS).toBe(24 * 60 * 60 * 1000)
  })
})
