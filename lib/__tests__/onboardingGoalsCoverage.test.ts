/**
 * Couverture des objectifs de l'onboarding : combien d'objectifs on complète,
 * d'où viennent les suggestions, comment le % est calculé, et ce que l'IA a le
 * droit de renvoyer.
 */
import {
  buildCoverage,
  ctaLabel,
  ctaPitch,
  toComplete,
  chosenGoals,
  fallbackRatings,
  fallbackSuggestions,
  goalPercent,
  hasGoalBasis,
  suggestionCount,
} from '@/lib/onboarding/goalsCoverage'
import { parseRatings, parseSuggestions } from '../../supabase/functions/onboarding-goals/core'
import { emptyDraft, type OnboardingDraft } from '@/lib/onboarding/draft'
import { HEALTH_STEPS, visibleSteps } from '@/lib/onboarding/steps'
import type { MatchedIngredient } from '@/lib/onboarding/verdict'


const draft = (patch: Partial<OnboardingDraft> = {}): OnboardingDraft => ({
  ...emptyDraft(new Date('2026-10-24T10:00:00Z')),
  ...patch,
})

describe('combien d’objectifs on complète', () => {
  it.each([
    [0, 5],
    [1, 4],
    [2, 3],
    [3, 0],
    [5, 0],
  ])('%i coché(s) → %i suggéré(s)', (chosen, expected) => {
    expect(suggestionCount(chosen)).toBe(expected)
  })

  it('l’objectif libre compte comme un objectif coché', () => {
    const c = chosenGoals(draft({ goals: ['reduire_taches', 'reduire_rides'], otherGoals: '  un teint éclatant ' }))
    expect(c.keys).toEqual(['reduire_taches', 'reduire_rides'])
    expect(c.custom).toEqual(['un teint éclatant'])
    expect(suggestionCount(c.keys.length + c.custom.length)).toBe(0)
  })
})

describe('suggestions de secours, tirées du profil', () => {
  it('sans objectif : soucis d’abord, puis type de peau, corps, cheveux, sans doublon', () => {
    const s = fallbackSuggestions(
      draft({ concerns: ['taches', 'acne'], skinTest: 'seche', bodySkin: 'tres_seche', hair: ['chute'] }),
      5,
    )
    expect(s.map((x) => x.key)).toEqual([
      'attenuer_boutons',
      'reduire_taches',
      'hydrater_profondeur',
      'peau_douce',
      'adoucir_corps',
    ])
    expect(s[1].why).toBe('Tu as dit : taches')
    expect(s[2].why).toBe('Ta peau est sèche')
  })

  it('ne propose jamais un objectif déjà coché', () => {
    const s = fallbackSuggestions(draft({ goals: ['reduire_taches'], concerns: ['taches'], skinTest: 'grasse' }), 4)
    expect(s.map((x) => x.key)).not.toContain('reduire_taches')
  })

  it('profil vide : rien à suggérer, et pas d’écran', () => {
    expect(fallbackSuggestions(draft(), 5)).toEqual([])
    expect(hasGoalBasis(draft())).toBe(false)
    expect(hasGoalBasis(draft({ concerns: ['rides'] }))).toBe(true)
    expect(hasGoalBasis(draft({ goals: ['reduire_chute'] }))).toBe(true)
  })
})

describe('pourcentage : moteur de la couverture de l’app', () => {
  it('un produit 5 étoiles qui sert fortement l’objectif ≈ 79 %, rien = 0 %', () => {
    expect(goalPercent(3, 18)).toBe(79)
    expect(goalPercent(0, 18)).toBe(0)
  })

  it('la qualité du produit pèse : même contribution, moins bon produit, moins de %', () => {
    expect(goalPercent(2, 18)).toBeGreaterThan(goalPercent(2, 10))
  })

  it('sépare couverts (triés du plus au moins) et encore à couvrir', () => {
    const r = buildCoverage({
      chosen: ['hydrater_profondeur', 'reduire_taches'],
      custom: ['un teint éclatant'],
      suggested: [{ key: 'peau_douce', why: 'Ta peau est sèche' }],
      ratings: { hydrater_profondeur: 3, reduire_taches: 0, peau_douce: 1 },
      customRatings: { custom_0: 2 },
      score: 16,
    })
    expect(r.rows).toHaveLength(4)
    expect(r.covered.map((x) => x.key)).toEqual(['hydrater_profondeur', 'custom_0', 'peau_douce'])
    expect(r.missing.map((x) => x.key)).toEqual(['reduire_taches'])
    expect(r.rows.find((x) => x.key === 'peau_douce')).toMatchObject({ suggested: true, why: 'Ta peau est sèche' })
    expect(r.rows.find((x) => x.key === 'custom_0')).toMatchObject({ label: 'un teint éclatant', isCustom: true })
  })
})

describe('notes de secours, d’après les actifs reconnus', () => {
  const m = (name: string): MatchedIngredient => ({
    input_token: name.toLowerCase(),
    position_idx: 0,
    name,
    color_rating: 'Vert',
    tags: [],
    match_kind: 'exact',
  })
  it('glycérine → hydratation, rien d’inventé ailleurs', () => {
    const r = fallbackRatings([m('AQUA'), m('GLYCERIN')])
    expect(r.hydrater_profondeur).toBe(2)
    expect(r.reduire_rides).toBeUndefined()
  })
})

describe('réponse de l’IA : bornée', () => {
  it('notes entières 0..3, clés demandées seulement', () => {
    const raw = '{"ratings":{"hydrater_profondeur":2.6,"reduire_rides":{"c":9},"inconnu":3,"peau_douce":-1}}'
    expect(parseRatings(raw, ['hydrater_profondeur', 'reduire_rides', 'peau_douce'])).toEqual({
      hydrater_profondeur: 3,
      reduire_rides: 3,
      peau_douce: 0,
    })
  })

  it('suggestions limitées aux candidats, sans doublon, sans tiret cadratin', () => {
    const raw =
      '{"suggested":[{"key":"reduire_taches","why":"Tu as dit — taches"},{"key":"reduire_taches","why":"x"},{"key":"pirater","why":"x"},{"key":"peau_douce","why":"Peau sèche"}]}'
    expect(parseSuggestions(raw, ['reduire_taches', 'peau_douce'], 5)).toEqual([
      { key: 'reduire_taches', why: 'Tu as dit , taches' },
      { key: 'peau_douce', why: 'Peau sèche' },
    ])
    expect(parseSuggestions('pas du json', ['peau_douce'], 2)).toEqual([])
  })

  it('écarte un objectif du visage justifié par la peau du corps', () => {
    const raw =
      '{"suggested":[{"key":"hydrater_profondeur","why":"Ta peau du corps tire"},{"key":"adoucir_corps","why":"Ta peau du corps tire"}]}'
    expect(parseSuggestions(raw, ['hydrater_profondeur', 'adoucir_corps'], 5).map((s) => s.key)).toEqual(['adoucir_corps'])
  })
})

describe('écran et bouton', () => {
  const ctx = {
    mode: 'guest' as const,
    consentGranted: true,
    consentAlreadyGiven: false,
    hasKnownName: false,
    hasScannedProduct: true,
    hasProductScore: true,
  }
  it('après le score de compatibilité, avant le paywall', () => {
    const steps = visibleSteps({ ...ctx, hasGoalBasis: true })
    expect(steps.slice(-3)).toEqual(['compat', 'goalsCoverage', 'paywall'])
  })
  it('caché sans base d’objectif, sans produit, ou sans consentement santé', () => {
    expect(visibleSteps({ ...ctx, hasGoalBasis: false })).not.toContain('goalsCoverage')
    expect(visibleSteps({ ...ctx, hasGoalBasis: true, hasScannedProduct: false })).not.toContain('goalsCoverage')
    expect(HEALTH_STEPS.has('goalsCoverage')).toBe(true)
  })
  it('le bouton pousse à compléter ce qui manque', () => {
    expect(ctaLabel(5)).toBe('Compléter mes 5 objectifs')
    expect(ctaLabel(1)).toBe('Compléter mon objectif')
    expect(ctaLabel(0)).toBe('Couvrir toute ma routine')
  })
  it('compte comme « à compléter » tout objectif sous 70 %, couvert à moitié compris', () => {
    const row = (percent: number) => ({ key: String(percent), label: '', percent, tone: 'vert' as const, suggested: false, why: null, isCustom: false })
    expect(toComplete([row(79), row(38), row(0)])).toBe(2)
  })
  it('la phrase dit la vérité sur ce qui manque, au bon nombre', () => {
    expect(ctaPitch(2, 2)).toBe('2 de tes objectifs ne sont pas couverts par ce produit. Je te trouve ceux qui les complètent.')
    expect(ctaPitch(1, 1)).toBe("Un de tes objectifs n'est pas couvert par ce produit. Je te trouve celui qui le complète.")
    expect(ctaPitch(5, 1)).toBe('Ce produit seul ne suffit pas pour 5 de tes objectifs. Je te trouve ceux qui les complètent.')
  })
})
