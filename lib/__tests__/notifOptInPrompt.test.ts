/**
 * Opt-in notifications : machine à états de sollicitation
 * (lib/notifications/optInPrompt.ts).
 *
 * POURQUOI ces tests : deux sollicitations MAX (onboarding + re-demande au
 * 2e scan), jamais si déjà accepté ou si les notifications sont déjà actives.
 * On verrouille le scénario complet demandé produit : étape onboarding passée
 * -> re-demande au 2e scan -> refus -> plus jamais.
 */

import {
  DEFAULT_NOTIF_PROMPT_STATE,
  markNotifPromptGranted,
  markNotifPromptSkipped,
  NOTIF_PROMPT_MAX_ASKS,
  readNotifPromptState,
  shouldReaskNotifications,
  type NotifPromptState,
} from '@/lib/notifications/optInPrompt'

describe('readNotifPromptState (coercition défensive)', () => {
  it('retombe sur le défaut pour null / non-objet / champs invalides', () => {
    expect(readNotifPromptState(null)).toEqual(DEFAULT_NOTIF_PROMPT_STATE)
    expect(readNotifPromptState('x')).toEqual(DEFAULT_NOTIF_PROMPT_STATE)
    expect(readNotifPromptState({ status: 'bogus', askCount: -2 })).toEqual({
      status: 'never',
      askCount: 0,
    })
  })

  it('conserve un état valide (askCount arrondi)', () => {
    expect(readNotifPromptState({ status: 'skipped', askCount: 1.7 })).toEqual({
      status: 'skipped',
      askCount: 1,
    })
  })
})

describe('shouldReaskNotifications', () => {
  it('jamais si les notifications sont déjà activées (réglages profil)', () => {
    expect(shouldReaskNotifications(DEFAULT_NOTIF_PROMPT_STATE, 5, true)).toBe(false)
  })

  it('jamais si déjà accepté', () => {
    const st: NotifPromptState = { status: 'granted', askCount: 1 }
    expect(shouldReaskNotifications(st, 10, false)).toBe(false)
  })

  it('pas avant le 2e scan', () => {
    const st: NotifPromptState = { status: 'skipped', askCount: 1 }
    expect(shouldReaskNotifications(st, 0, false)).toBe(false)
    expect(shouldReaskNotifications(st, 1, false)).toBe(false)
    expect(shouldReaskNotifications(st, 2, false)).toBe(true)
  })

  it("s'arrête au plafond de sollicitations", () => {
    const st: NotifPromptState = { status: 'skipped', askCount: NOTIF_PROMPT_MAX_ASKS }
    expect(shouldReaskNotifications(st, 10, false)).toBe(false)
  })

  it('onboarding entièrement passé (étape jamais vue) : re-demande possible', () => {
    // askCount = 0 : le « Passer » global avant l'étape ne consomme rien.
    expect(shouldReaskNotifications(DEFAULT_NOTIF_PROMPT_STATE, 2, false)).toBe(true)
  })
})

describe('scénario complet produit', () => {
  it('onboarding passé -> re-demande au 2e scan -> refus -> plus jamais', () => {
    // Étape onboarding montrée, « Passer » : sollicitation 1 consommée.
    let st = markNotifPromptSkipped(DEFAULT_NOTIF_PROMPT_STATE)
    expect(st).toEqual({ status: 'skipped', askCount: 1 })
    // 1er scan : pas de re-demande.
    expect(shouldReaskNotifications(st, 1, false)).toBe(false)
    // 2e scan : re-demande (sollicitation 2, consommée à l'affichage).
    expect(shouldReaskNotifications(st, 2, false)).toBe(true)
    st = markNotifPromptSkipped(st)
    // « Plus tard » : plafond atteint, plus jamais.
    expect(shouldReaskNotifications(st, 50, false)).toBe(false)
  })

  it('acceptation à la re-demande : verrouillé granted', () => {
    let st = markNotifPromptSkipped(DEFAULT_NOTIF_PROMPT_STATE) // onboarding passé
    st = markNotifPromptSkipped(st) // carte affichée (consommée)
    st = markNotifPromptGranted(st) // l'utilisateur accepte
    expect(st.status).toBe('granted')
    expect(shouldReaskNotifications(st, 100, false)).toBe(false)
  })
})
