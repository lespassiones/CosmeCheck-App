import { orderByTierShuffled, tierRank, seededShuffle } from '@/lib/analysis/tierShuffle'

type P = { id: number; score: number }
const scoreOf = (p: P) => p.score

// 30 produits : 12 "cœur vert" (≥17), 10 "feuille verte" (13-16), 5 jaunes, 3 oranges
function pool(): P[] {
  const out: P[] = []
  let id = 0
  for (let i = 0; i < 12; i++) out.push({ id: id++, score: 17 + (i % 3) }) // 17-19
  for (let i = 0; i < 10; i++) out.push({ id: id++, score: 13 + (i % 3) }) // 13-15
  for (let i = 0; i < 5; i++) out.push({ id: id++, score: 9 + (i % 2) })   // 9-10
  for (let i = 0; i < 3; i++) out.push({ id: id++, score: 5 + (i % 2) })   // 5-6
  return out
}

describe('tierRank', () => {
  it('seuils pastille', () => {
    expect(tierRank(19)).toBe(0)
    expect(tierRank(17)).toBe(0)
    expect(tierRank(16.99)).toBe(1)
    expect(tierRank(13)).toBe(1)
    expect(tierRank(9)).toBe(2)
    expect(tierRank(5)).toBe(3)
    expect(tierRank(4.99)).toBe(4)
    expect(tierRank(null)).toBe(4)
  })
})

describe('orderByTierShuffled — ordre des tiers préservé', () => {
  it('les tiers restent triés (meilleur d’abord), jamais mélangés entre eux', () => {
    const res = orderByTierShuffled(pool(), 'analysis-A', scoreOf)
    const ranks = res.map((p) => tierRank(p.score))
    // ranks doit être non-décroissant (0…0,1…1,2…2,3…3)
    for (let i = 1; i < ranks.length; i++) {
      expect(ranks[i]).toBeGreaterThanOrEqual(ranks[i - 1])
    }
    // tous les cœur-vert avant tous les feuille-verte, etc.
    expect(res.filter((p) => tierRank(p.score) === 0)).toHaveLength(12)
  })

  it('même graine → même ordre (stable pour une analyse donnée)', () => {
    const a = orderByTierShuffled(pool(), 'analysis-A', scoreOf).map((p) => p.id)
    const b = orderByTierShuffled(pool(), 'analysis-A', scoreOf).map((p) => p.id)
    expect(a).toEqual(b)
  })

  it('graines différentes → ordre différent DANS le tier (variété par analyse)', () => {
    const a = orderByTierShuffled(pool(), 'analysis-A', scoreOf).map((p) => p.id)
    const b = orderByTierShuffled(pool(), 'analysis-B', scoreOf).map((p) => p.id)
    expect(a).not.toEqual(b)
    // mais les 12 premiers sont toujours les 12 cœur-vert (mêmes ids, ordre différent)
    const topA = new Set(a.slice(0, 12))
    const topB = new Set(b.slice(0, 12))
    expect(topA).toEqual(topB)
  })

  it('le top affiché varie entre deux analyses (les 6 premiers ne sont pas identiques)', () => {
    const a = orderByTierShuffled(pool(), 'A', scoreOf).slice(0, 6).map((p) => p.id)
    const b = orderByTierShuffled(pool(), 'ZZZ', scoreOf).slice(0, 6).map((p) => p.id)
    expect(a).not.toEqual(b)
  })

  it('conserve tous les éléments (aucune perte)', () => {
    const res = orderByTierShuffled(pool(), 'x', scoreOf)
    expect(res).toHaveLength(30)
    expect(new Set(res.map((p) => p.id)).size).toBe(30)
  })

  it('liste vide / un seul élément', () => {
    expect(orderByTierShuffled([], 'x', scoreOf)).toEqual([])
    const one = [{ id: 1, score: 18 }]
    expect(orderByTierShuffled(one, 'x', scoreOf)).toEqual(one)
  })
})

describe('seededShuffle', () => {
  it('déterministe + ne perd rien', () => {
    const arr = [1, 2, 3, 4, 5, 6, 7, 8]
    expect(seededShuffle(arr, 123)).toEqual(seededShuffle(arr, 123))
    expect([...seededShuffle(arr, 123)].sort((a, b) => a - b)).toEqual(arr)
  })
})
