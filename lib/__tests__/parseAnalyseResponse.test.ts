/**
 * RÉGRESSION — analyses « illisibles » (écran d'analyse → « Oups, le résultat
 * de cette analyse est illisible »).
 *
 * Cause racine (investiguée 30 juin 2026) : le court-circuit cache EAN de
 * l'Edge `analyser` a persisté, pour certains produits (adhésifs dentaires
 * « Adhesivo », « Power Max »…), un result_json réduit à `{ items, synthesis }`
 * SANS `score` ni `counts`. L'ancien `parseAnalyseResponse` exigeait `score`
 * (number) ET `counts` (object) → renvoyait null → « illisible ».
 *
 * Le correctif rend le parse RÉSILIENT : tant qu'`items` est un tableau, on
 * reconstruit `counts` (tally) et `score` (formule pondérée) depuis items.
 * Forme du fixture = copie EXACTE d'une ligne cassée en prod.
 */
import { parseAnalyseResponse } from '@/lib/analysis/types'

// Item tel que stocké dans la ligne cassée (result_json.items[0]).
const BROKEN_ITEM = {
  name: 'POLYVINYL ACETATE',
  slug: 'polyvinyl-acetate',
  tags: [],
  input: 'POLYVINYL ACETATE',
  position: 1,
  casNumber: null,
  matchKind: 'exact',
  confidence: 1,
  colorRating: 'Orange',
  allFunctions: ['Antistatique', 'Agent fixant'],
  dbColorRating: 'Orange',
  translationFr: null,
  thresholdLabel: null,
  primaryFunction: 'Antistatique',
  thresholdContext: null,
}

describe('parseAnalyseResponse — résilience aux analyses incomplètes', () => {
  it('rejette une entrée non-objet', () => {
    expect(parseAnalyseResponse(null)).toBeNull()
    expect(parseAnalyseResponse('x')).toBeNull()
    expect(parseAnalyseResponse(42)).toBeNull()
  })

  it('rejette un result_json sans items (irrécupérable)', () => {
    expect(parseAnalyseResponse({ score: 12, counts: {} })).toBeNull()
    expect(parseAnalyseResponse({ items: 'pas-un-tableau' })).toBeNull()
  })

  it('reconstruit score + counts quand ils manquent (cas « illisible » réel)', () => {
    const broken = {
      items: [
        { ...BROKEN_ITEM, position: 1, colorRating: 'Vert' },
        { ...BROKEN_ITEM, position: 2, colorRating: 'Vert' },
        { ...BROKEN_ITEM, position: 3, colorRating: 'Vert' },
        { ...BROKEN_ITEM, position: 4, colorRating: 'Jaune' },
        { ...BROKEN_ITEM, position: 5, colorRating: 'Orange' },
        { ...BROKEN_ITEM, position: 6, colorRating: 'Orange' },
      ],
      synthesis: null,
    }
    const parsed = parseAnalyseResponse(broken)
    expect(parsed).not.toBeNull()
    expect(parsed!.counts).toEqual({
      total: 6,
      matched: 6,
      vert: 3,
      jaune: 1,
      orange: 2,
      rouge: 0,
      unknown: 0,
    })
    expect(typeof parsed!.score).toBe('number')
    expect(parsed!.score).toBeGreaterThanOrEqual(0)
    expect(parsed!.score).toBeLessThanOrEqual(20)
    expect(typeof parsed!.scoreLabel).toBe('string')
    expect(['green', 'amber', 'orange', 'rose']).toContain(parsed!.scoreTone)
    // Garantit que les structures itérées en aval existent.
    expect(Array.isArray(parsed!.observations)).toBe(true)
    // Spectre reconstruit depuis items (5/10 premières positions).
    expect(parsed!.spectrum.top5).toEqual(['Vert', 'Vert', 'Vert', 'Jaune', 'Orange'])
    expect(parsed!.spectrum.top10).toHaveLength(6)
  })

  it('compte les couleurs inconnues (colorRating null) dans `unknown`', () => {
    const parsed = parseAnalyseResponse({
      items: [
        { ...BROKEN_ITEM, position: 1, colorRating: 'Vert' },
        { ...BROKEN_ITEM, position: 2, colorRating: null },
      ],
    })
    expect(parsed!.counts.unknown).toBe(1)
    expect(parsed!.counts.matched).toBe(1)
    expect(parsed!.counts.total).toBe(2)
  })

  it('NE touche PAS un result_json déjà complet', () => {
    const full = {
      score: 17.8,
      scoreLabel: 'Très bien',
      scoreTone: 'green',
      counts: { total: 5, matched: 5, vert: 3, jaune: 1, orange: 1, rouge: 0, unknown: 0 },
      items: [{ ...BROKEN_ITEM }],
      observations: [{ tag: 'x', label: 'X', status: 'info', count: 0 }],
      spectrum: { top5: ['Vert'], top10: ['Vert'] },
      synthesis: 'déjà là',
    }
    const parsed = parseAnalyseResponse(full)
    expect(parsed!.score).toBe(17.8)
    expect(parsed!.scoreLabel).toBe('Très bien')
    expect(parsed!.counts.vert).toBe(3)
    expect(parsed!.synthesis).toBe('déjà là')
  })

  it('reconstruit le spectre top5/top10 depuis items si absent', () => {
    const items = Array.from({ length: 12 }, (_, i) => ({
      ...BROKEN_ITEM,
      position: i + 1,
      colorRating: (['Vert', 'Jaune', 'Orange', 'Rouge'] as const)[i % 4],
    }))
    const parsed = parseAnalyseResponse({ items }) // pas de spectrum
    expect(parsed!.spectrum.top5).toHaveLength(5)
    expect(parsed!.spectrum.top10).toHaveLength(10)
    expect(parsed!.spectrum.top5[0]).toBe('Vert')
    expect(parsed!.spectrum.top5[2]).toBe('Orange')
  })

  it('NE touche pas un spectre déjà rempli', () => {
    const parsed = parseAnalyseResponse({
      items: [{ ...BROKEN_ITEM, position: 1, colorRating: 'Vert' }],
      spectrum: { top5: ['Rouge'], top10: ['Rouge'] },
    })
    expect(parsed!.spectrum.top5).toEqual(['Rouge'])
  })

  it('coerce les tags-objet (Wikidata) en tableau vide', () => {
    const parsed = parseAnalyseResponse({
      items: [
        {
          ...BROKEN_ITEM,
          position: 1,
          colorRating: 'Orange',
          tags: { wikidata_qid: 'Q1' } as unknown as string[],
        },
      ],
    })
    expect(Array.isArray(parsed!.items[0].tags)).toBe(true)
    expect(parsed!.items[0].tags).toEqual([])
  })
})
