/**
 * « Plus de crédits » vs « trop de requêtes » : deux 429 qu'il ne faut pas
 * confondre (le second ouvrait à tort la feuille des crédits).
 */

import { creditsFromBody, isNoCreditsRefusal } from '@/lib/credits/noCreditsCore'

describe('isNoCreditsRefusal', () => {
  it('429 du gate (code no_credits)', () => {
    expect(
      isNoCreditsRefusal(429, { error: '…', code: 'no_credits', credits: { used: 5, limit: 5, remaining: 0 } }),
    ).toBe(true)
  })
  it('429 sans code mais avec crédits (synthesis, personal-insights)', () => {
    expect(isNoCreditsRefusal(429, { error: '…', credits: { used: 5, limit: 5 } })).toBe(true)
  })
  it('rate-limit IP : 429 sans code ni crédits', () => {
    expect(isNoCreditsRefusal(429, { error: 'Trop de requêtes. Réessaye dans un instant.' })).toBe(false)
  })
  it('corps illisible ou autre statut', () => {
    expect(isNoCreditsRefusal(429, null)).toBe(false)
    expect(isNoCreditsRefusal(503, { code: 'no_credits' })).toBe(false)
  })
})

describe('creditsFromBody', () => {
  it('lit used / limit', () => {
    expect(creditsFromBody({ credits: { used: 5, limit: 5 } })).toEqual({ used: 5, limit: 5 })
  })
  it('ignore les champs absents ou non numériques', () => {
    expect(creditsFromBody({ credits: { used: '5' } })).toEqual({ used: undefined, limit: undefined })
    expect(creditsFromBody(null)).toEqual({ used: undefined, limit: undefined })
  })
})
