/**
 * applyRestrictions — marquage is_restricted, en particulier le matching des
 * FAMILLES via leurs noms INCI membres (régression du bug « silicones non
 * détectés » : une famille était comparée aux fonctions de l'item, jamais à ses
 * vrais ingrédients).
 */
// analyser.ts importe le client supabase au top-level → on le neutralise.
jest.mock('@/lib/supabase/client', () => ({ supabase: {}, db: () => ({}) }))

import { applyRestrictions } from '@/lib/analysis/analyser'
import type { AnalyseResponse } from '@/lib/analysis/types'
import type { UserRestrictions } from '@/lib/supabase/types'

function resp(names: string[]): AnalyseResponse {
  return {
    items: names.map((name, i) => ({ position: i, input: name, name })),
  } as unknown as AnalyseResponse
}

const SILICONES: UserRestrictions = { families: ['silicones'], ingredients: [] }
const FAMILY_NAMES = ['Dimethicone', 'Cyclopentasiloxane', 'Cyclohexasiloxane']

function flaggedNames(r: AnalyseResponse): string[] {
  return r.items
    .filter((i) => (i as { is_restricted?: boolean }).is_restricted)
    .map((i) => i.name ?? '')
}

describe('applyRestrictions — familles', () => {
  it('marque les ingrédients membres de la famille évitée (silicones → Dimethicone)', () => {
    const out = applyRestrictions(
      resp(['Aqua', 'Dimethicone', 'Glycerin']),
      SILICONES,
      FAMILY_NAMES,
    )
    expect(flaggedNames(out)).toEqual(['Dimethicone'])
  })

  it('SANS les noms membres, la famille ne matche pas (reproduit le bug d’origine)', () => {
    const out = applyRestrictions(resp(['Aqua', 'Dimethicone']), SILICONES)
    expect(flaggedNames(out)).toEqual([])
  })

  it('matching insensible à la casse et aux accents', () => {
    const out = applyRestrictions(resp(['CYCLOPENTASILOXANE']), SILICONES, FAMILY_NAMES)
    expect(flaggedNames(out)).toEqual(['CYCLOPENTASILOXANE'])
  })

  it('aucune restriction → rien marqué', () => {
    const out = applyRestrictions(
      resp(['Aqua', 'Dimethicone']),
      { families: [], ingredients: [] },
      FAMILY_NAMES,
    )
    expect(flaggedNames(out)).toEqual([])
  })
})

describe('applyRestrictions — ingrédients explicites', () => {
  it('marque un ingrédient évité par son nom (sous-chaîne)', () => {
    const out = applyRestrictions(resp(['Aqua', 'Parfum', 'Glycerin']), {
      families: [],
      ingredients: [{ name: 'Parfum' }],
    } as unknown as UserRestrictions)
    expect(flaggedNames(out)).toEqual(['Parfum'])
  })
})
