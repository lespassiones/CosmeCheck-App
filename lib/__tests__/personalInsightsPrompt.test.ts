/**
 * Régression "3 blocs IA" (personal-insights) : le bloc goals mettait en avant
 * l'huile de coco (bas de liste, peu dosée, mais fonction "Conditionneur
 * capillaire") sur une crème capillaire, en ignorant tournesol/avocat plus
 * concentrés. Le prompt disait « pas en fin de liste » sans jamais recevoir la
 * position. On teste la partie déterministe : rang #N + règle de concentration.
 */
import {
  buildPrompt,
  PERSONAL_PROMPT_VERSION,
  type PersonalInput,
} from '../../supabase/functions/personal-insights/prompt'

type G = { name: string; fn: string; pos: number }
const HAIR_GREENS: G[] = [
  { name: 'Aqua', fn: 'Solvant', pos: 0 },
  { name: 'Helianthus Annuus Seed Oil', fn: 'Emollient', pos: 1 },
  { name: 'Glycerin', fn: 'Humectant', pos: 2 },
  { name: 'Glyceryl Stearate SE', fn: 'Agent émulsifiant', pos: 3 },
  { name: 'Persea Gratissima Oil', fn: "Agent d'entretien de la peau", pos: 5 },
  { name: 'Cocos Nucifera Oil', fn: 'Conditionneur capillaire', pos: 6 },
  { name: 'Mangifera Indica Seed Butter', fn: "Agent d'entretien de la peau", pos: 7 },
]

function makeInput(opts?: { greens?: G[]; profileBlock?: string | null }): PersonalInput {
  const greens = opts?.greens ?? HAIR_GREENS
  return {
    enriched: greens.map((g) => ({
      input_raw: g.name,
      name: g.name,
      color_rating: 'Vert' as const,
      primary_function: g.fn,
      tags: null,
      position_idx: g.pos,
    })),
    counts: { Vert: greens.length, Jaune: 3, Orange: 0, Rouge: 0 },
    score: 16.5,
    scoreLabel: 'Bon',
    scoreTone: 'green',
    productLabel: 'Crème CAPILLAIRE',
    category: 'Crème capillaire',
    userId: 'test',
    profileBlock:
      opts?.profileBlock === undefined ? '- Cheveux : Secs, Cheveux ternes / cassants' : opts.profileBlock,
    restrictionsBlock: null,
    restrictionMatches: [],
  }
}

describe('personal-insights buildPrompt — concentration (ordre INCI)', () => {
  it('version bumpée (régénère les blocs en cache)', () => {
    expect(PERSONAL_PROMPT_VERSION).toBeGreaterThanOrEqual(11)
  })

  it('chaque vert porte son rang [#N INCI]', () => {
    const { user } = buildPrompt(makeInput())
    expect(user).toContain('Helianthus Annuus Seed Oil (Emollient) [#2 INCI]')
    expect(user).toContain('Cocos Nucifera Oil (Conditionneur capillaire) [#7 INCI]')
  })

  it('les huiles dominantes précèdent la coco dans la liste fournie au LLM', () => {
    const { user } = buildPrompt(makeInput())
    const sun = user.indexOf('Helianthus Annuus Seed Oil')
    const avo = user.indexOf('Persea Gratissima Oil')
    const coco = user.indexOf('Cocos Nucifera Oil')
    expect(sun).toBeGreaterThan(-1)
    expect(sun).toBeLessThan(coco)
    expect(avo).toBeLessThan(coco)
  })

  it('tri par concentration robuste même si enriched est mélangé', () => {
    const { user } = buildPrompt(makeInput({ greens: [...HAIR_GREENS].reverse() }))
    expect(user.indexOf('Helianthus Annuus Seed Oil')).toBeLessThan(
      user.indexOf('Cocos Nucifera Oil'),
    )
  })

  it('la règle de concentration est dans le system prompt', () => {
    const { system } = buildPrompt(makeInput())
    expect(system).toContain('CONCENTRATION (ordre INCI)')
    expect(system).toMatch(/REGROUPE-les/i)
    expect(system).toMatch(/hu?ile de coco/i) // exemple explicite du piège
  })

  it('présente la règle même sans profil (mode B)', () => {
    const { system } = buildPrompt(makeInput({ profileBlock: null }))
    expect(system).toContain('CONCENTRATION (ordre INCI)')
  })
})
