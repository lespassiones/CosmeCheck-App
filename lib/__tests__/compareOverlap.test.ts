/**
 * routineOverlapSlugs + buildCompareBonASavoir — helpers purs utilisés par
 * l'écran Compare pour dériver l'overlap routine sans 2e requête Supabase.
 */
import {
  buildCompareBonASavoir,
  routineOverlapSlugs,
  type RoutineOverlapItem,
} from '@/lib/routine/compareOverlap'
import type { AnalyseResponse } from '@/lib/analysis/types'
import type { CompareSide } from '@/lib/routine/compare'

function fakeAnalysis(slugs: string[]) {
  return {
    score: 18,
    counts: { total: 0, matched: 0, unknown: 0, vert: 0, jaune: 0, orange: 0, rouge: 0 },
    items: slugs.map((s, i) => ({
      position: i,
      input: s,
      slug: s,
      name: s,
      colorRating: 'Vert',
    })),
  }
}

function fakeItem(id: string, slugs: string[]): RoutineOverlapItem {
  return {
    analysis: {
      id,
      result_json: fakeAnalysis(slugs),
    },
  }
}

function fakeSide(name: string, slugs: string[], allergens = 0): CompareSide {
  const result: AnalyseResponse = {
    ...fakeAnalysis(slugs),
    euFragranceAllergens: { total: allergens, names: [] },
  } as unknown as AnalyseResponse
  return { id: `id-${name}`, name, score: 18, result }
}

describe('routineOverlapSlugs', () => {
  it('routine vide → set vide', () => {
    expect(routineOverlapSlugs([], [])).toEqual(new Set())
    expect(routineOverlapSlugs(null, ['a'])).toEqual(new Set())
    expect(routineOverlapSlugs(undefined, ['a'])).toEqual(new Set())
  })

  it('collecte les slugs ingrédients de toutes les analyses jointes', () => {
    const items = [
      fakeItem('p1', ['aqua', 'glycerin']),
      fakeItem('p2', ['talc', 'aqua']),
    ]
    expect(routineOverlapSlugs(items, [])).toEqual(new Set(['aqua', 'glycerin', 'talc']))
  })

  it('EXCLUT les analyses listées dans excludeIds (pour ne pas faire d auto-overlap avec A/B)', () => {
    const items = [
      fakeItem('A', ['aqua', 'glycerin']),
      fakeItem('B', ['talc']),
      fakeItem('C', ['parfum']),
    ]
    const slugs = routineOverlapSlugs(items, ['A', 'B'])
    expect(slugs).toEqual(new Set(['parfum']))
  })

  it('ignore les items avec analysis null ou result_json corrompu', () => {
    const items: RoutineOverlapItem[] = [
      { analysis: null },
      { analysis: { id: 'x', result_json: null } },
      { analysis: { id: 'y', result_json: 'corrupt' } },
      fakeItem('ok', ['aqua']),
    ]
    expect(routineOverlapSlugs(items, [])).toEqual(new Set(['aqua']))
  })

  it('ignore les items sans id (ne peuvent pas être filtrés via excludeIds)', () => {
    const items: RoutineOverlapItem[] = [
      { analysis: { id: null, result_json: fakeAnalysis(['x']) } },
    ]
    expect(routineOverlapSlugs(items, [])).toEqual(new Set())
  })
})

describe('buildCompareBonASavoir', () => {
  const empty = new Set<string>()

  it('routine vide + aucun allergène → aucune phrase', () => {
    const a = fakeSide('A', ['aqua', 'glycerin'])
    const b = fakeSide('B', ['talc'])
    expect(buildCompareBonASavoir({ a, b, routineSlugs: empty })).toEqual([])
  })

  it('overlap routine >= 3 pour A → 1 phrase mentionnant A', () => {
    const a = fakeSide('A', ['aqua', 'glycerin', 'parfum', 'talc'])
    const b = fakeSide('B', ['xanthan'])
    const routine = new Set(['aqua', 'glycerin', 'parfum'])
    const out = buildCompareBonASavoir({ a, b, routineSlugs: routine })
    expect(out).toHaveLength(1)
    expect(out[0]).toContain('A')
    expect(out[0]).toContain('3 ingrédients')
  })

  it('overlap < 3 → pas de phrase routine', () => {
    const a = fakeSide('A', ['aqua', 'glycerin'])
    const b = fakeSide('B', ['xanthan'])
    const routine = new Set(['aqua', 'glycerin'])
    expect(buildCompareBonASavoir({ a, b, routineSlugs: routine })).toEqual([])
  })

  it('allergènes parfum sur A seulement → phrase mentionnant A', () => {
    const a = fakeSide('A', ['aqua'], 2)
    const b = fakeSide('B', ['xanthan'], 0)
    const out = buildCompareBonASavoir({ a, b, routineSlugs: empty })
    expect(out).toHaveLength(1)
    expect(out[0]).toContain('A')
    expect(out[0]).toMatch(/2 allergènes? de parfum déclarés?/)
  })

  it('allergènes sur B seulement → phrase mentionnant B', () => {
    const a = fakeSide('A', ['aqua'], 0)
    const b = fakeSide('B', ['xanthan'], 5)
    const out = buildCompareBonASavoir({ a, b, routineSlugs: empty })
    expect(out).toHaveLength(1)
    expect(out[0]).toContain('B')
  })

  it('allergènes sur les DEUX → aucune phrase allergène (rien ne distingue)', () => {
    const a = fakeSide('A', ['aqua'], 2)
    const b = fakeSide('B', ['xanthan'], 1)
    expect(buildCompareBonASavoir({ a, b, routineSlugs: empty })).toEqual([])
  })

  it('combine routine + allergènes (jusqu à 4 phrases possibles)', () => {
    const a = fakeSide('A', ['aqua', 'glycerin', 'parfum'], 3)
    const b = fakeSide('B', ['xanthan', 'talc', 'butylene'], 0)
    const routine = new Set(['aqua', 'glycerin', 'parfum', 'xanthan', 'talc', 'butylene'])
    const out = buildCompareBonASavoir({ a, b, routineSlugs: routine })
    // 1 phrase routine A (overlap 3) + 1 phrase routine B (overlap 3) + 1 phrase allergènes A
    expect(out.length).toBe(3)
  })
})
