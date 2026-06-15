import { filterHistory } from '@/lib/history/filterHistory'

type Row = { id: string; searchTokens: string[]; favori: boolean }

const items: Row[] = [
  { id: 'a', searchTokens: ['crème visage', 'aqua'], favori: true },
  { id: 'b', searchTokens: ['shampoing', 'sodium'], favori: false },
  { id: 'c', searchTokens: ['lait capillaire'], favori: true },
]

describe('filterHistory', () => {
  it('sans filtre → tout', () => {
    expect(filterHistory(items, '', false).map((r) => r.id)).toEqual(['a', 'b', 'c'])
  })

  it('favoris uniquement', () => {
    expect(filterHistory(items, '', true).map((r) => r.id)).toEqual(['a', 'c'])
  })

  it('recherche texte (insensible casse, sous-chaîne)', () => {
    expect(filterHistory(items, 'CAPILL', false).map((r) => r.id)).toEqual(['c'])
  })

  it('favoris + recherche combinés', () => {
    // "visage" ne matche que a (favori) ; b/c exclus.
    expect(filterHistory(items, 'visage', true).map((r) => r.id)).toEqual(['a'])
    // un terme présent sur un non-favori → exclu en mode favoris
    expect(filterHistory(items, 'shampoing', true)).toEqual([])
  })

  it('espaces autour de la recherche ignorés', () => {
    expect(filterHistory(items, '  aqua  ', false).map((r) => r.id)).toEqual(['a'])
  })
})
