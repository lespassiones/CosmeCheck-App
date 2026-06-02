/**
 * summarizeRoutine — dérive le résumé routine du dashboard à partir des
 * items react-query (`['routine', userId]`). Test pur (env node).
 */
import { summarizeRoutine } from '@/lib/routine/summary'

function fakeAnalysis(counts: {
  vert: number
  jaune: number
  orange: number
  rouge: number
}) {
  return {
    analysis: {
      result_json: {
        score: 18,
        counts: { total: 10, matched: 10, unknown: 0, ...counts },
        items: [],
      },
    },
  }
}

describe('summarizeRoutine', () => {
  it('routine vide → count 0 et counts à zéro', () => {
    expect(summarizeRoutine([])).toEqual({
      count: 0,
      counts: { vert: 0, jaune: 0, orange: 0, rouge: 0 },
    })
  })

  it('null / undefined → count 0', () => {
    expect(summarizeRoutine(null)).toEqual({
      count: 0,
      counts: { vert: 0, jaune: 0, orange: 0, rouge: 0 },
    })
    expect(summarizeRoutine(undefined)).toEqual({
      count: 0,
      counts: { vert: 0, jaune: 0, orange: 0, rouge: 0 },
    })
  })

  it('un produit → counts repris tels quels et count=1', () => {
    const items = [fakeAnalysis({ vert: 3, jaune: 1, orange: 2, rouge: 0 })]
    expect(summarizeRoutine(items)).toEqual({
      count: 1,
      counts: { vert: 3, jaune: 1, orange: 2, rouge: 0 },
    })
  })

  it('plusieurs produits → counts cumulés', () => {
    const items = [
      fakeAnalysis({ vert: 3, jaune: 1, orange: 2, rouge: 0 }),
      fakeAnalysis({ vert: 2, jaune: 0, orange: 1, rouge: 1 }),
      fakeAnalysis({ vert: 5, jaune: 2, orange: 0, rouge: 0 }),
    ]
    expect(summarizeRoutine(items)).toEqual({
      count: 3,
      counts: { vert: 10, jaune: 3, orange: 3, rouge: 1 },
    })
  })

  it('compte les items même si result_json est invalide (count = N), mais counts cumule seulement les valides', () => {
    const items = [
      fakeAnalysis({ vert: 1, jaune: 0, orange: 0, rouge: 0 }),
      { analysis: null }, // pas d'analyse jointe
      { analysis: { result_json: null } }, // pas de résultat
      { analysis: { result_json: 'corrupt' } }, // mal formé
    ]
    const s = summarizeRoutine(items)
    expect(s.count).toBe(4) // count = nombre d'items routine (même titres vides)
    expect(s.counts).toEqual({ vert: 1, jaune: 0, orange: 0, rouge: 0 })
  })

  it('ignore les result_json sans counts numériques', () => {
    const items = [{ analysis: { result_json: { score: 10, counts: {} } } }]
    // parseAnalyseResponse accepte { score, counts:{} } (counts est un objet),
    // mais les champs vert/jaune/... sont NaN-équivalents → on les force à 0.
    const s = summarizeRoutine(items)
    expect(s.count).toBe(1)
    // Comportement attendu : on n'additionne pas NaN dans le total.
    expect(Number.isNaN(s.counts.vert)).toBe(false)
    expect(Number.isNaN(s.counts.jaune)).toBe(false)
  })
})
