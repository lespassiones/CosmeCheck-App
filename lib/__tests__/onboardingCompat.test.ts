/**
 * Score de compatibilité de l'onboarding (sans compte, sans IA) :
 * même moteur additif que l'app, et seulement des bons points vérifiés.
 */
import { buildOnboardingCompat } from '@/lib/onboarding/compat'
import type { MatchedIngredient } from '@/lib/onboarding/verdict'

const m = (name: string, color: string, tags: string[] = [], slug?: string): MatchedIngredient => ({
  input_token: name.toLowerCase(),
  position_idx: 0,
  slug: slug ?? name.toLowerCase().replace(/\W+/g, '-'),
  name,
  color_rating: color,
  tags,
  match_kind: 'exact',
})

const clean = [m('AQUA', 'Vert'), m('GLYCERIN', 'Vert'), m('NIACINAMIDE', 'Vert'), m('PHENOXYETHANOL', 'Jaune')]

const base = {
  productName: 'Gel hydratant',
  scoreLabel: 'Très bien',
  ingredientCount: 4,
  skin: 'grasse' as const,
  restrictions: ['parfum' as const],
  personalized: true,
}

describe('buildOnboardingCompat', () => {
  it('formule propre et adaptée : base qualité + 2 points par actif utile, bons points personnels', () => {
    const c = buildOnboardingCompat({ ...base, score: 16, matches: clean, goals: ['hydrater_profondeur'] })
    expect(c).not.toBeNull()
    // 16/20 = 80, + Glycérine + Niacinamide (2 × 2).
    expect(c!.score).toBe(84)
    expect(c!.tone).toBe('vert')
    expect(c!.personal).toBe(true)
    expect(c!.goodPoints).toEqual([
      'Glycérine, pour ton objectif « une peau bien hydratée »',
      'Niacinamide, pour resserrer les pores de ta peau grasse',
      'Sans parfum, comme tu le veux',
      'Rien de ce que je surveille pour ta peau grasse',
    ])
  })

  it('ce qu’elle évite et ce qui gêne sa peau font baisser le score, et ne sont jamais cités en bon point', () => {
    const matches = [...clean, m('PARFUM', 'Jaune', ['parfum-synthese']), m('ALCOHOL DENAT.', 'Jaune', ['alcool'])]
    const c = buildOnboardingCompat({ ...base, score: 16, matches, ingredientCount: 6 })!
    // 80 + 4 (actifs) - 5 (alcool pour peau grasse) - 8 (parfum évité).
    expect(c.score).toBe(71)
    expect(c.goodPoints.join(' ')).not.toMatch(/parfum|surveille/i)
    expect(c.goodPoints[0]).toBe('Glycérine, pour hydrater ta peau grasse')
  })

  it('plafond couleurs : un ingrédient rouge limite le score à 59', () => {
    const c = buildOnboardingCompat({ ...base, score: 19, matches: [...clean, m('METHYLPARABEN', 'Rouge', ['paraben'])] })!
    expect(c.score).toBe(59)
    expect(c.goodPoints).not.toContain('Aucun ingrédient noté rouge')
    expect(c.goodPoints.join(' ')).not.toMatch(/orange ou rouge/)
  })

  it('sans consentement : score de la formule seule, aucun bon point personnel', () => {
    const c = buildOnboardingCompat({ ...base, score: 16, matches: clean, personalized: false })!
    expect(c.score).toBe(80)
    expect(c.personal).toBe(false)
    expect(c.goodPoints.join(' ')).not.toMatch(/ta peau|tu le veux|objectif/)
    expect(c.goodPoints[0]).toBe('Glycérine, pour hydrater la peau')
  })

  it('liste illisible : aucun bon point inventé', () => {
    const c = buildOnboardingCompat({ ...base, score: 14, matches: [], personalized: false, restrictions: [] })!
    expect(c.score).toBe(70)
    expect(c.goodPoints).toEqual([])
  })

  it('pas de note catalogue : pas de score', () => {
    expect(buildOnboardingCompat({ ...base, score: null, matches: clean })).toBeNull()
  })

  it('jamais plus de 4 bons points', () => {
    const c = buildOnboardingCompat({ ...base, score: 18, matches: clean, restrictions: ['parfum', 'sulfates'] })!
    expect(c.goodPoints.length).toBeLessThanOrEqual(4)
  })
})
