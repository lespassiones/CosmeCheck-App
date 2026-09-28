/**
 * alternativesFormulation : filtre AVEC REPLI des alternatives par forme
 * galénique (même forme d'abord, puis voisine ou inconnue, jamais opposée), et
 * condition d'arrêt de la boucle de remplissage (comptée APRÈS le filtre).
 */
import {
  groupByFormulation,
  needsMoreCandidates,
  orderFormulationGroups,
} from '@/lib/analysis/alternativesFormulation'
import { classifyFormulation, type Galenic } from '@/lib/inci/formulation'

interface Cand {
  id: string
  score: number
  inci: string
}

const galenicOf = (c: Cand): Galenic => classifyFormulation(c.inci).galenic
const scoreOf = (c: Cand) => c.score
const ids = (list: Cand[]) => list.map((c) => c.id)

// Candidats d'une même catégorie « crème hydratante », INCI réels.
const CREME_A: Cand = {
  id: 'creme-a',
  score: 15,
  inci: 'AQUA, GLYCERIN, CETEARYL ALCOHOL, CAPRYLIC/CAPRIC TRIGLYCERIDE, GLYCERYL STEARATE',
}
const CREME_B: Cand = {
  id: 'creme-b',
  score: 18,
  inci: 'AQUA, BUTYROSPERMUM PARKII BUTTER, GLYCERIN, CETEARYL ALCOHOL, SQUALANE',
}
const GEL_AQUEUX: Cand = {
  id: 'gel-aqueux',
  score: 19,
  inci: 'AQUA, GLYCERIN, SODIUM HYALURONATE, PANTHENOL, CARBOMER',
}
const HUILE: Cand = {
  id: 'huile',
  score: 20,
  inci: 'PRUNUS AMYGDALUS DULCIS OIL, SIMMONDSIA CHINENSIS SEED OIL, TOCOPHEROL',
}
const BAUME: Cand = { id: 'baume', score: 19.5, inci: 'BUTYROSPERMUM PARKII BUTTER' }
const INCONNU: Cand = { id: 'inconnu', score: 16, inci: '' }

describe('groupByFormulation', () => {
  it('source crème eau-première : crèmes d abord, aqueux/inconnu en repli, huile et baume écartés', () => {
    const g = groupByFormulation([HUILE, CREME_A, GEL_AQUEUX, BAUME, CREME_B, INCONNU], 'emulsion', galenicOf)
    expect(ids(g.same)).toEqual(['creme-a', 'creme-b'])
    expect(ids(g.fallback)).toEqual(['gel-aqueux', 'inconnu'])
    expect(ids(g.excluded)).toEqual(['huile', 'baume'])
  })

  it('source huile : huiles puis baumes, jamais de crème ni de gel aqueux', () => {
    const g = groupByFormulation([CREME_A, HUILE, GEL_AQUEUX, BAUME], 'anhydrous_oil', galenicOf)
    expect(ids(g.same)).toEqual(['huile'])
    expect(ids(g.fallback)).toEqual(['baume'])
    expect(ids(g.excluded)).toEqual(['creme-a', 'gel-aqueux'])
  })

  it('gel douche source : aucun savon solide', () => {
    const gelDouche: Cand = { id: 'gel', score: 14, inci: 'AQUA, SODIUM LAURETH SULFATE, COCAMIDOPROPYL BETAINE' }
    const pain: Cand = { id: 'pain', score: 18, inci: 'SODIUM OLIVATE, AQUA, SODIUM CHLORIDE, SODIUM HYDROXIDE' }
    const g = groupByFormulation([pain, gelDouche], 'wash', galenicOf)
    expect(ids(g.same)).toEqual(['gel'])
    expect(ids(g.excluded)).toEqual(['pain'])
  })

  it('source inconnue : fail-open, tout en repli, rien d écarté', () => {
    const g = groupByFormulation([HUILE, CREME_A, BAUME], 'unknown', galenicOf)
    expect(g.same).toEqual([])
    expect(ids(g.fallback)).toEqual(['huile', 'creme-a', 'baume'])
    expect(g.excluded).toEqual([])
  })
})

describe('orderFormulationGroups', () => {
  const groups = groupByFormulation([HUILE, GEL_AQUEUX, CREME_A, INCONNU, CREME_B], 'emulsion', galenicOf)

  it('sans graine : même forme d abord (par note), puis repli (par note)', () => {
    expect(ids(orderFormulationGroups(groups, scoreOf))).toEqual(['creme-b', 'creme-a', 'gel-aqueux', 'inconnu'])
  })

  it('avec graine : le mélange par tier reste À L INTÉRIEUR de chaque groupe', () => {
    const ordered = ids(orderFormulationGroups(groups, scoreOf, 'analyse-123'))
    expect(ordered.slice(0, 2).sort()).toEqual(['creme-a', 'creme-b'])
    expect(ordered.slice(2).sort()).toEqual(['gel-aqueux', 'inconnu'])
  })
})

describe('needsMoreCandidates : comptage APRÈS filtre de formule', () => {
  it('vivier utilisable insuffisant : on continue', () => {
    expect(
      needsMoreCandidates({ sameCount: 0, usableCount: 5, poolTarget: 32, displayTarget: 10, sourceKnown: true }),
    ).toBe(true)
  })

  it('vivier suffisant mais trop peu de même forme (source connue) : on continue', () => {
    expect(
      needsMoreCandidates({ sameCount: 3, usableCount: 40, poolTarget: 32, displayTarget: 10, sourceKnown: true }),
    ).toBe(true)
  })

  it('assez de même forme : on s arrête', () => {
    expect(
      needsMoreCandidates({ sameCount: 12, usableCount: 40, poolTarget: 32, displayTarget: 10, sourceKnown: true }),
    ).toBe(false)
  })

  it('source inconnue : seul le vivier compte (pas de chasse à la même forme)', () => {
    expect(
      needsMoreCandidates({ sameCount: 0, usableCount: 40, poolTarget: 32, displayTarget: 10, sourceKnown: false }),
    ).toBe(false)
  })
})
