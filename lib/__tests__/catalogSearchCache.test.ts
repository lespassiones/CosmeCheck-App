/**
 * searchCache — normalisation de clé + queryKey de la recherche catalogue.
 * Test pur (env node). Vérifie que des requêtes sémantiquement équivalentes
 * partagent une seule entrée de cache (même clé).
 */
import { QueryClient } from '@tanstack/react-query'
import {
  CATALOG_SEARCH_KEY,
  CATALOG_SEARCH_STALE_MS,
  catalogSearchKey,
  normalizeSearchQuery,
} from '@/lib/catalog/searchCache'

describe('normalizeSearchQuery', () => {
  it('insensible à la casse', () => {
    expect(normalizeSearchQuery('Garnier')).toBe('garnier')
    expect(normalizeSearchQuery('GARNIER')).toBe('garnier')
  })

  it('insensible aux accents', () => {
    expect(normalizeSearchQuery('crème')).toBe('creme')
    expect(normalizeSearchQuery('Élixir')).toBe('elixir')
  })

  it("insensible à l'ordre des mots (tri)", () => {
    expect(normalizeSearchQuery('garnier ultra doux')).toBe(
      normalizeSearchQuery('doux ultra garnier'),
    )
  })

  it('collapse les espaces multiples et trim', () => {
    expect(normalizeSearchQuery('  garnier   doux  ')).toBe('doux garnier')
  })

  it('ponctuation → séparateur (apostrophe, tiret)', () => {
    // "l'oréal" → tokens "l" + "oreal", triés
    expect(normalizeSearchQuery("L'Oréal")).toBe('l oreal')
  })

  it('chaîne vide → vide', () => {
    expect(normalizeSearchQuery('   ')).toBe('')
  })

  it('équivalence complète casse + accents + ordre', () => {
    // L’exemple de l’utilisateur : "Purepousse CREME Garnier" vs "garnier PurePousse crème"
    expect(normalizeSearchQuery('Purepousse CREME Garnier')).toBe(
      normalizeSearchQuery('garnier PurePousse crème'),
    )
  })
})

describe('catalogSearchKey', () => {
  it('forme [racine, requête normalisée, offset]', () => {
    expect(catalogSearchKey('Garnier', 0)).toEqual([CATALOG_SEARCH_KEY, 'garnier', 0])
    expect(catalogSearchKey('Garnier', 50)).toEqual([CATALOG_SEARCH_KEY, 'garnier', 50])
  })

  it('requêtes équivalentes → MÊME clé (cache partagé)', () => {
    expect(catalogSearchKey('Crème Garnier', 0)).toEqual(
      catalogSearchKey('garnier creme', 0),
    )
  })

  it('offsets différents → clés différentes (pagination cachée séparément)', () => {
    expect(catalogSearchKey('garnier', 0)).not.toEqual(catalogSearchKey('garnier', 50))
  })

  it('expose un staleTime positif', () => {
    expect(CATALOG_SEARCH_STALE_MS).toBeGreaterThan(0)
  })
})

describe('cache réel via fetchQuery (preuve du dédoublonnage)', () => {
  function makeClient() {
    return new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    })
  }

  it('une recherche identique retapée ne rappelle PAS la RPC (staleTime)', async () => {
    const client = makeClient()
    let calls = 0
    const fetchPage = (q: string, offset: number) =>
      client.fetchQuery({
        queryKey: catalogSearchKey(q, offset),
        staleTime: CATALOG_SEARCH_STALE_MS,
        queryFn: async () => {
          calls++
          return [{ ean: '1' }]
        },
      })

    await fetchPage('Garnier', 0)
    await fetchPage('Garnier', 0)
    expect(calls).toBe(1) // 2e appel servi depuis le cache
  })

  it('requêtes équivalentes (casse/accents/ordre) partagent le cache', async () => {
    const client = makeClient()
    let calls = 0
    const fetchPage = (q: string) =>
      client.fetchQuery({
        queryKey: catalogSearchKey(q, 0),
        staleTime: CATALOG_SEARCH_STALE_MS,
        queryFn: async () => {
          calls++
          return []
        },
      })

    await fetchPage('Crème Garnier')
    await fetchPage('garnier creme')
    await fetchPage('GARNIER CRÈME')
    expect(calls).toBe(1) // une seule entrée de cache pour les 3
  })

  it('une recherche différente déclenche bien un nouvel appel', async () => {
    const client = makeClient()
    let calls = 0
    const fetchPage = (q: string) =>
      client.fetchQuery({
        queryKey: catalogSearchKey(q, 0),
        staleTime: CATALOG_SEARCH_STALE_MS,
        queryFn: async () => {
          calls++
          return []
        },
      })

    await fetchPage('garnier')
    await fetchPage('nivea')
    expect(calls).toBe(2)
  })

  it('pages (offsets) différentes = appels distincts', async () => {
    const client = makeClient()
    let calls = 0
    const fetchPage = (offset: number) =>
      client.fetchQuery({
        queryKey: catalogSearchKey('garnier', offset),
        staleTime: CATALOG_SEARCH_STALE_MS,
        queryFn: async () => {
          calls++
          return []
        },
      })

    await fetchPage(0)
    await fetchPage(50)
    expect(calls).toBe(2)
  })
})
