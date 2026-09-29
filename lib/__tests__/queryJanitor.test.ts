/**
 * Ménage mémoire du cache React Query : jamais une requête affichée ou en vol,
 * transitoires libérées après inactivité, persistées plafonnées aux plus récentes.
 */
import { selectEvictions, type CacheEntryInfo } from '../storage/queryJanitor'

const NOW = 1_000_000_000
const MIN = 60 * 1000

const entry = (hash: string, rootKey: string | null, over: Partial<CacheEntryInfo> = {}): CacheEntryInfo => ({
  hash,
  rootKey,
  active: false,
  fetching: false,
  updatedAt: NOW - 10 * MIN,
  ...over,
})

describe('selectEvictions', () => {
  it("ne retire jamais une requête affichée ou en cours de chargement", () => {
    const out = selectEvictions(
      [
        entry('a', 'catalog-search', { active: true, updatedAt: 0 }),
        entry('b', 'catalog-search', { fetching: true, updatedAt: 0 }),
      ],
      { now: NOW, aggressive: true },
    )
    expect(out).toEqual([])
  })

  it('libère une requête transitoire inactive depuis plus de 5 min, pas avant', () => {
    const out = selectEvictions(
      [
        entry('old', 'catalog-search', { updatedAt: NOW - 6 * MIN }),
        entry('fresh', 'alternatives', { updatedAt: NOW - 1 * MIN }),
      ],
      { now: NOW },
    )
    expect(out).toEqual(['old'])
  })

  it('garde les N requêtes persistées inactives les plus récentes', () => {
    const entries = Array.from({ length: 5 }, (_, i) => entry(`ing${i}`, 'ingredient', { updatedAt: NOW - i * MIN }))
    const out = selectEvictions(entries, { now: NOW, maxInactivePersisted: 3 })
    expect(out.sort()).toEqual(['ing3', 'ing4'])
  })

  it('une clé sans racine texte est traitée comme transitoire', () => {
    expect(selectEvictions([entry('x', null, { updatedAt: NOW - 30 * MIN })], { now: NOW })).toEqual(['x'])
  })

  it('alerte mémoire : libère tout ce qui n est pas affiché', () => {
    const out = selectEvictions(
      [entry('p', 'routine'), entry('t', 'credits'), entry('shown', 'ingredient', { active: true })],
      { now: NOW, aggressive: true },
    )
    expect(out.sort()).toEqual(['p', 't'])
  })
})
