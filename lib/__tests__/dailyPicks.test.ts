/**
 * pickTodaysItems — sélection déterministe (catalogue stable, rotation par jour).
 *
 * Ces tests documentent l'invariant qui justifie la décision de mettre le
 * CATALOGUE en cache react-query persisté (queryKey stable) et de DÉRIVER la
 * sélection du jour client-side : la sélection ne dépend QUE du catalogue
 * + de la date passée. Le catalogue lui-même n'a pas à être re-fetché à
 * chaque rotation quotidienne.
 */
import { pickTodaysItems, type DailyPickItem } from '@/lib/dailyPicks/select'

function makeCatalog(n: number): DailyPickItem[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `item-${i}`,
    kind: i % 2 === 0 ? 'quiz' : 'myth',
    order_index: i,
    question: `Q${i}?`,
    options: ['A', 'B', 'C', 'D'],
    correct_index: i % 4,
    reveal: `reveal ${i}`,
    category: null,
  }))
}

// Helpers d'epoch days (1 jour = 86 400 000 ms).
const DAY_MS = 86_400_000

describe('pickTodaysItems — déterminisme', () => {
  it('catalogue vide → renvoie []', () => {
    expect(pickTodaysItems([], new Date(0))).toEqual([])
  })

  it('catalogue ≤ 10 items → renvoie tout, même un jour différent', () => {
    const cat = makeCatalog(7)
    const day1 = pickTodaysItems(cat, new Date(0))
    const day2 = pickTodaysItems(cat, new Date(30 * DAY_MS))
    expect(day1).toEqual(cat)
    expect(day2).toEqual(cat)
  })

  it('catalogue > 10 → renvoie exactement 10 items', () => {
    const cat = makeCatalog(50)
    expect(pickTodaysItems(cat, new Date(0))).toHaveLength(10)
  })

  it('catalogue identique + même jour → même sélection (déterminisme)', () => {
    const cat = makeCatalog(50)
    const a = pickTodaysItems(cat, new Date(123 * DAY_MS))
    const b = pickTodaysItems(cat, new Date(123 * DAY_MS))
    expect(a.map((x) => x.id)).toEqual(b.map((x) => x.id))
  })

  it('catalogue identique + jours différents → sélections différentes (rotation)', () => {
    const cat = makeCatalog(50)
    // 50 items / 10 picks/jour → 5 batches. day0 et day1 doivent différer.
    const d0 = pickTodaysItems(cat, new Date(0)).map((x) => x.id).join(',')
    const d1 = pickTodaysItems(cat, new Date(DAY_MS)).map((x) => x.id).join(',')
    expect(d0).not.toBe(d1)
  })

  it('boucle au début quand le catalogue est non-multiple de 10', () => {
    const cat = makeCatalog(11) // > 10 → entre dans la branche batch
    const result = pickTodaysItems(cat, new Date(0))
    expect(result).toHaveLength(10)
    // Tous les IDs doivent venir du catalogue source.
    const ids = new Set(cat.map((x) => x.id))
    for (const r of result) expect(ids.has(r.id)).toBe(true)
  })

  it("invariant cache : un catalogue stable peut servir plusieurs jours sans re-fetch", () => {
    // C'est l'invariant qui justifie le queryKey ['dailyPicksCatalog'] stable
    // (sans la date) + select(catalogue → today's items).
    const cat = makeCatalog(50)
    const seen = new Set<string>()
    for (let day = 0; day < 7; day++) {
      const picks = pickTodaysItems(cat, new Date(day * DAY_MS))
      seen.add(picks.map((x) => x.id).join(','))
    }
    // 7 jours consécutifs : on doit voir au moins 2 sélections distinctes.
    expect(seen.size).toBeGreaterThanOrEqual(2)
  })
})
