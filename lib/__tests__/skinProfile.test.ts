/**
 * lib/skin/profile — parsing du profil + migrations legacy + gates onboarding.
 * Logique critique (pilote l'onboarding et l'advisor). Test pur (node).
 */
import {
  readSkinProfile,
  isProfileComplete,
  isProfileStarted,
  readOnboardingShown,
} from '@/lib/skin/profile'

describe('readSkinProfile', () => {
  it('retourne {} pour des préférences vides/invalides', () => {
    expect(readSkinProfile(null)).toEqual({})
    expect(readSkinProfile({})).toEqual({})
    expect(readSkinProfile({ skin: 'nope' as unknown as object })).toEqual({})
  })

  it('parse les champs valides', () => {
    const p = readSkinProfile({
      skin: {
        skinTypeFace: 'mixte',
        skinTypeBody: 'sensible',
        concerns: ['acne', 'rougeurs'],
        goals: ['peau_douce'],
        hairConcerns: ['secs'],
        otherHair: 'cheveux bouclés',
      },
    })
    expect(p.skinTypeFace).toBe('mixte')
    expect(p.skinTypeBody).toBe('sensible')
    expect(p.concerns).toEqual(['acne', 'rougeurs'])
    expect(p.goals).toEqual(['peau_douce'])
    expect(p.hairConcerns).toEqual(['secs'])
    expect(p.otherHair).toBe('cheveux bouclés')
  })

  it('ignore une valeur enum invalide', () => {
    expect(readSkinProfile({ skin: { skinTypeFace: 'plasma' } }).skinTypeFace).toBeUndefined()
  })

  it('migre les valeurs legacy (anti-age→rides, cuir_chevelu→hairConcern, skinType→body)', () => {
    const p = readSkinProfile({
      skin: { concerns: ['anti-age', 'cuir_chevelu', 'cheveux'], skinType: 'tres_seche' },
    })
    expect(p.concerns).toEqual(['rides']) // anti-age→rides ; cuir_chevelu/cheveux retirés
    expect(p.hairConcerns).toContain('cuir_chevelu_sensible') // cuir_chevelu migré côté cheveux
    expect(p.skinTypeBody).toBe('tres_seche') // legacy skinType → skinTypeBody
  })
})

describe('readOnboardingShown', () => {
  it('lit le flag à la racine de preferences', () => {
    expect(readOnboardingShown({ onboardingShown: true })).toBe(true)
    expect(readOnboardingShown({ onboardingShown: false })).toBe(false)
    expect(readOnboardingShown({})).toBe(false)
    expect(readOnboardingShown(null)).toBe(false)
  })
})

describe('isProfileStarted', () => {
  it('vrai dès UN signal renseigné', () => {
    expect(isProfileStarted({ goals: ['peau_douce'] })).toBe(true)
    expect(isProfileStarted({ otherHair: 'x' })).toBe(true)
    expect(isProfileStarted({})).toBe(false)
  })
})

describe('isProfileComplete', () => {
  it('exige au moins 2 des 3 sections (peau / préoccupations / objectifs)', () => {
    // 1 seule section (peau) → incomplet
    expect(isProfileComplete({ skinTypeFace: 'mixte' })).toBe(false)
    // peau + préoccupations → complet
    expect(isProfileComplete({ skinTypeFace: 'mixte', concerns: ['acne'] })).toBe(true)
    // préoccupations + objectifs → complet
    expect(isProfileComplete({ concerns: ['acne'], goals: ['peau_douce'] })).toBe(true)
    // rien → incomplet
    expect(isProfileComplete({})).toBe(false)
  })
})
