/**
 * Textes de l'écran Profil : résumé beauté, restrictions, crédits.
 */
import { beautyProfileSummary, restrictionsCount } from '../skin/profileSummary'
import { creditsPeriodLabel, creditsRefillLabel, nextUtcMidnight, splitCredits } from '../credits/refill'

describe('beautyProfileSummary', () => {
  it('résume type de peau + nombre de préoccupations', () => {
    expect(
      beautyProfileSummary({ skinTypeFace: 'mixte', concerns: ['rougeurs', 'rides'], hairConcerns: ['pellicules'] }),
    ).toBe('Peau mixte · 3 préoccupations')
  })

  it("ne compte pas l'état des cheveux (secs, gras) comme une préoccupation", () => {
    expect(beautyProfileSummary({ skinTypeFace: 'grasse', hairConcerns: ['gras', 'secs'] })).toBe('Peau grasse')
  })

  it('accorde le singulier', () => {
    expect(beautyProfileSummary({ concerns: ['rides'] })).toBe('1 préoccupation')
  })

  it('retombe sur les objectifs quand il n’y a ni peau ni préoccupation', () => {
    expect(beautyProfileSummary({ goals: ['peau_douce', 'teint_uniforme'] })).toBe('2 objectifs')
  })

  it('profil vide : « À compléter »', () => {
    expect(beautyProfileSummary({})).toBe('À compléter')
  })
})

describe('restrictionsCount', () => {
  it('additionne familles et ingrédients', () => {
    expect(restrictionsCount({ families: ['parfums', 'silicones'], ingredients: [{ slug: 'a', name: 'A' }] })).toBe(3)
    expect(restrictionsCount({ families: [], ingredients: [] })).toBe(0)
  })
})

describe('crédits', () => {
  it('période du solde', () => {
    expect(creditsPeriodLabel('daily')).toBe("aujourd'hui")
    expect(creditsPeriodLabel(null)).toBe("aujourd'hui")
    expect(creditsPeriodLabel('weekly')).toBe('cette semaine')
    expect(creditsPeriodLabel('monthly')).toBe('ce mois-ci')
    expect(creditsPeriodLabel('one_time')).toBe('au total')
  })

  it('le quota quotidien bascule au prochain minuit UTC', () => {
    expect(nextUtcMidnight(new Date('2026-09-28T21:30:00Z')).toISOString()).toBe('2026-09-29T00:00:00.000Z')
    expect(nextUtcMidnight(new Date('2026-12-31T23:59:00Z')).toISOString()).toBe('2027-01-01T00:00:00.000Z')
  })

  it('recharge quotidienne : heure locale du minuit UTC, cohérente avec le fuseau courant', () => {
    const now = new Date('2026-09-28T12:00:00Z')
    const at = nextUtcMidnight(now)
    const expected =
      at.getHours() === 0 && at.getMinutes() === 0
        ? 'Se rechargent à minuit'
        : `Se rechargent à ${at.getHours()} h${at.getMinutes() ? String(at.getMinutes()).padStart(2, '0') : ''}`
    expect(creditsRefillLabel('daily', now)).toBe(expected)
  })

  it('autres périodes', () => {
    expect(creditsRefillLabel('weekly')).toBe('Se rechargent chaque semaine')
    expect(creditsRefillLabel('monthly')).toBe('Se rechargent chaque mois')
    expect(creditsRefillLabel('one_time')).toBeNull()
  })
})

describe('splitCredits', () => {
  it('sépare quota de la période et bonus renvoyé par la RPC', () => {
    expect(splitCredits({ remaining: 60, limit: 5, bonus: 55 })).toEqual({ periodLeft: 5, bonus: 55 })
    expect(splitCredits({ remaining: 3, limit: 5, bonus: 0 })).toEqual({ periodLeft: 3, bonus: 0 })
  })

  it('sans champ bonus : l’excédent au-delà de la limite est du bonus', () => {
    expect(splitCredits({ remaining: 60, limit: 5 })).toEqual({ periodLeft: 5, bonus: 55 })
    expect(splitCredits({ remaining: 2, limit: 5 })).toEqual({ periodLeft: 2, bonus: 0 })
  })

  it('quota épuisé mais bonus restant', () => {
    expect(splitCredits({ remaining: 10, limit: 5, bonus: 10 })).toEqual({ periodLeft: 0, bonus: 10 })
  })
})
