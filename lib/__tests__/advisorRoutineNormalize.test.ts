/**
 * normalizeRoutineRows — bridge entre la forme RPC plate (nouvelle) et le
 * select embed legacy (ancien). Garantit l'iso-fonctionnalité avant/après la
 * migration `cosme_check_get_routine_tags`.
 */
import { normalizeRoutineRows } from '../../supabase/functions/advisor-chat/routineNormalize'

describe('normalizeRoutineRows — entrée invalide', () => {
  it('null / undefined / non-array → []', () => {
    expect(normalizeRoutineRows(null)).toEqual([])
    expect(normalizeRoutineRows(undefined)).toEqual([])
    expect(normalizeRoutineRows('whatever')).toEqual([])
    expect(normalizeRoutineRows({})).toEqual([])
  })

  it('array vide → []', () => {
    expect(normalizeRoutineRows([])).toEqual([])
  })

  it('ignore les éléments non-objets', () => {
    expect(normalizeRoutineRows([null, 42, 'x', false])).toEqual([])
  })
})

describe('normalizeRoutineRows — forme A : rows RPC plate', () => {
  it('un row complet RPC → fact correct', () => {
    const rows = [
      {
        name: 'Crème hydratante',
        product_label: 'Hydra+ Crème',
        score: 18.3,
        frequency: 'daily',
        tags: ['hydratant', 'apaisant'],
      },
    ]
    expect(normalizeRoutineRows(rows)).toEqual([
      {
        name: 'Hydra+ Crème',
        score: 18.3,
        frequency: 'daily',
        tags: ['hydratant', 'apaisant'],
      },
    ])
  })

  it('product_label vide → fallback sur name', () => {
    expect(
      normalizeRoutineRows([
        { name: 'Le nom', product_label: '', score: 10, frequency: 'weekly', tags: [] },
      ]),
    ).toEqual([{ name: 'Le nom', score: 10, frequency: 'weekly', tags: [] }])
  })

  it('aucun name/label → "Analyse"', () => {
    expect(
      normalizeRoutineRows([{ score: 12, frequency: 'monthly', tags: ['x'] }]),
    ).toEqual([{ name: 'Analyse', score: 12, frequency: 'monthly', tags: ['x'] }])
  })

  it('frequence absente → fallback "daily"', () => {
    expect(
      normalizeRoutineRows([
        { name: 'X', product_label: 'X', score: 0, tags: ['a'] },
      ]),
    ).toEqual([{ name: 'X', score: 0, frequency: 'daily', tags: ['a'] }])
  })

  it('coupe à 6 tags max', () => {
    const tags = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
    const out = normalizeRoutineRows([
      { name: 'X', product_label: 'X', score: 10, frequency: 'daily', tags },
    ])
    expect(out[0].tags).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
  })

  it('filtre les tags non-string', () => {
    const out = normalizeRoutineRows([
      { name: 'X', product_label: 'X', score: 10, frequency: 'daily', tags: ['ok', 42, null, 'ok2'] },
    ])
    expect(out[0].tags).toEqual(['ok', 'ok2'])
  })

  it('score non-numérique → null', () => {
    const out = normalizeRoutineRows([
      { product_label: 'X', score: 'bad', frequency: 'daily', tags: [] },
    ])
    expect(out[0].score).toBeNull()
  })
})

describe('normalizeRoutineRows — forme B : embed legacy avec result_json', () => {
  it('extrait les tags depuis result_json.items et dédupe', () => {
    const rows = [
      {
        frequency: 'daily',
        analyses: {
          name: 'Crème',
          product_label: 'Crème ABC',
          score: 17,
          result_json: {
            items: [
              { tags: ['hydratant', 'apaisant'] },
              { tags: ['apaisant', 'antioxydant'] },
            ],
          },
        },
      },
    ]
    const out = normalizeRoutineRows(rows)
    expect(out[0].name).toBe('Crème ABC')
    expect(out[0].frequency).toBe('daily')
    expect(out[0].score).toBe(17)
    // Dédupé : apaisant n'apparaît qu'une fois.
    expect(new Set(out[0].tags)).toEqual(new Set(['hydratant', 'apaisant', 'antioxydant']))
  })

  it('analyses null → ignoré', () => {
    expect(normalizeRoutineRows([{ frequency: 'daily', analyses: null }])).toEqual([])
  })

  it('result_json absent → fact sans tags', () => {
    const out = normalizeRoutineRows([
      {
        frequency: 'daily',
        analyses: { name: 'X', product_label: 'X', score: 10, result_json: null },
      },
    ])
    expect(out).toEqual([{ name: 'X', score: 10, frequency: 'daily', tags: [] }])
  })

  it('coupe à 6 tags max après dédup', () => {
    const items = Array.from({ length: 12 }, (_, i) => ({ tags: [`tag${i}`] }))
    const out = normalizeRoutineRows([
      {
        frequency: 'daily',
        analyses: { name: 'X', product_label: 'X', score: 10, result_json: { items } },
      },
    ])
    expect(out[0].tags).toHaveLength(6)
  })
})

describe('normalizeRoutineRows — limites globales', () => {
  it('coupe à 12 facts max', () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({
      name: `n${i}`,
      product_label: `p${i}`,
      score: i,
      frequency: 'daily',
      tags: [],
    }))
    expect(normalizeRoutineRows(rows)).toHaveLength(12)
  })

  it('iso-fonctionnel : rows RPC ↔ rows embed (parité de sortie)', () => {
    // Même donnée modélisée des 2 façons → même fact en sortie.
    const rpc = [
      { name: 'X', product_label: 'X', score: 15, frequency: 'weekly', tags: ['t1', 't2'] },
    ]
    const embed = [
      {
        frequency: 'weekly',
        analyses: {
          name: 'X',
          product_label: 'X',
          score: 15,
          result_json: { items: [{ tags: ['t1'] }, { tags: ['t2'] }] },
        },
      },
    ]
    const rpcOut = normalizeRoutineRows(rpc)
    const embedOut = normalizeRoutineRows(embed)
    // Comparer modulo l'ordre des tags (Set vs Array → on compare en sets).
    expect(rpcOut[0].name).toBe(embedOut[0].name)
    expect(rpcOut[0].score).toBe(embedOut[0].score)
    expect(rpcOut[0].frequency).toBe(embedOut[0].frequency)
    expect(new Set(rpcOut[0].tags)).toEqual(new Set(embedOut[0].tags))
  })
})
