/**
 * Garde des MODES D'EMPLOI (coherence-analyze).
 *
 * Contexte : audit prod 07/2026. Le LLM transforme parfois une consigne d'usage
 * ("appliquer avant le coucher") en promesse → verdict "non démontré" à tort,
 * ce qui fait chuter le score. Ce garde écarte les consignes d'usage SANS
 * toucher aux vraies promesses qui contiennent le mot "utilisation".
 * PARITÉ avec le web (lib/coherence/usageInstructionGuard.ts côté CosmetWiki).
 *
 * Les extraits ci-dessous sont VERBATIM issus de coherence_analyses en prod.
 */
import { isUsageInstruction } from '../../supabase/functions/coherence-analyze/lib/usageInstructionGuard'

describe('isUsageInstruction — modes d\'emploi écartés (cas prod réels)', () => {
  it('Triple Dry : "appliquer avant le coucher" (label Utilisation optimale)', () => {
    expect(isUsageInstruction('Utilisation optimale', 'appliquer avant le coucher')).toBe(true)
  })

  it('label "Conseils d\'utilisation" seul suffit', () => {
    expect(isUsageInstruction("Conseils d'utilisation", 'sur peau propre')).toBe(true)
  })

  it('verbe directif en tête : "masser jusqu\'à pénétration"', () => {
    expect(isUsageInstruction('Application', 'masser jusqu\'à pénétration complète')).toBe(true)
  })

  it('impératif : "Appliquez matin et soir sur peau propre"', () => {
    expect(isUsageInstruction('Routine', 'Appliquez matin et soir sur peau propre')).toBe(true)
  })

  it('filler de tête toléré : "Bien rincer après application"', () => {
    expect(isUsageInstruction('Rinçage', 'Bien rincer après application')).toBe(true)
  })

  it('"laisser poser" reconnu', () => {
    expect(isUsageInstruction('Pose', 'laisser poser 5 minutes puis rincer')).toBe(true)
  })
})

describe('isUsageInstruction — VRAIES promesses conservées (ne pas casser)', () => {
  it('"+37% peau plus douce après 7 jours d\'utilisation" (LRP Lipikar) → gardée', () => {
    expect(
      isUsageInstruction('Douceur de la peau', "+37% peau plus douce après 7 jours d'utilisation"),
    ).toBe(false)
  })

  it('"améliore la sensation cutanée pendant et après l\'utilisation" (Dado Sens) → gardée', () => {
    expect(
      isUsageInstruction('Confort cutané', "améliore la sensation cutanée pendant et après l'utilisation"),
    ).toBe(false)
  })

  it('effet classique "hydrate les cheveux en profondeur" → gardée', () => {
    expect(isUsageInstruction('Hydratation', 'hydrate les cheveux en profondeur')).toBe(false)
  })

  it('présence d\'actif "enrichie en spiruline" → gardée', () => {
    expect(isUsageInstruction('Présence : Spiruline', 'enrichie en spiruline')).toBe(false)
  })

  it('"rend les mains douces" → gardée (rend ≠ verbe directif)', () => {
    expect(isUsageInstruction('Douceur de la peau', 'les rend douces')).toBe(false)
  })

  // PIÈGE réel (Baume Coco PBDP) : "laisser" est ambigu. Ici = EFFET, à garder.
  it('"laisser les mains douces" (Baume Coco) → gardée', () => {
    expect(isUsageInstruction('Douceur de la peau', 'laisser les mains douces')).toBe(false)
  })

  it('"laisse un film protecteur sur la peau" (Rogé Cavaillès) → gardée', () => {
    expect(isUsageInstruction('Protection de la peau', 'laisse un film protecteur sur la peau')).toBe(false)
  })

  it('"éviter la casse" (effet capillaire) → gardée', () => {
    expect(isUsageInstruction('Anti-casse', 'éviter la casse des cheveux')).toBe(false)
  })
})

describe('isUsageInstruction — bornes', () => {
  it('extrait vide + label non-usage → gardée', () => {
    expect(isUsageInstruction('Hydratation', '')).toBe(false)
  })

  it('label vide + verbe directif en tête → écartée', () => {
    expect(isUsageInstruction('', 'appliquer sur cheveux humides')).toBe(true)
  })
})
