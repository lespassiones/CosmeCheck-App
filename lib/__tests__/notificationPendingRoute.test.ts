/**
 * Destination d'une notification en attente (lib/notifications/pendingRoute.ts).
 *
 * POURQUOI ces tests : au tap d'une notification app fermée, la navigation
 * immédiate était perdue (navigateur pas monté, redirection du guard) et la
 * personne atterrissait sur l'accueil. La route est désormais déposée puis
 * ouverte UNE fois, seulement quand l'app est posée.
 */

import {
  PENDING_ROUTE_TTL_MS,
  canOpenNotificationRoute,
  getPendingNotificationRoute,
  setPendingNotificationRoute,
  subscribePendingNotificationRoute,
  takePendingNotificationRoute,
  type NotificationRouteGate,
} from '@/lib/notifications/pendingRoute'

const READY: NotificationRouteGate = {
  navReady: true,
  authLoading: false,
  signInPending: false,
  isAuthenticated: true,
  profileLoading: false,
  draftPending: false,
  paywallShown: true,
  guardTarget: null,
  group: '(tabs)',
}

describe('pendingRoute : dépôt et consommation', () => {
  afterEach(() => {
    takePendingNotificationRoute()
  })

  it('une route déposée est rendue une seule fois', () => {
    setPendingNotificationRoute('/ingredient/glycerin')
    expect(getPendingNotificationRoute()).toBe('/ingredient/glycerin')
    expect(takePendingNotificationRoute()).toBe('/ingredient/glycerin')
    expect(takePendingNotificationRoute()).toBeNull()
    expect(getPendingNotificationRoute()).toBeNull()
  })

  it('le dernier tap remplace le précédent', () => {
    setPendingNotificationRoute('/advisor')
    setPendingNotificationRoute('/offre')
    expect(takePendingNotificationRoute()).toBe('/offre')
  })

  it('une route trop ancienne est oubliée', () => {
    setPendingNotificationRoute('/advisor', 1_000)
    expect(getPendingNotificationRoute(1_000 + PENDING_ROUTE_TTL_MS)).toBe('/advisor')
    expect(getPendingNotificationRoute(1_000 + PENDING_ROUTE_TTL_MS + 1)).toBeNull()
    expect(takePendingNotificationRoute(1_000 + PENDING_ROUTE_TTL_MS + 1)).toBeNull()
  })

  it('prévient les abonnés au dépôt et au retrait', () => {
    const ecouteur = jest.fn()
    const stop = subscribePendingNotificationRoute(ecouteur)
    setPendingNotificationRoute('/advisor')
    takePendingNotificationRoute()
    expect(ecouteur).toHaveBeenCalledTimes(2)
    stop()
    setPendingNotificationRoute('/offre')
    expect(ecouteur).toHaveBeenCalledTimes(2)
  })
})

describe('canOpenNotificationRoute', () => {
  it('ouvre quand l app est posée sur un écran ordinaire', () => {
    expect(canOpenNotificationRoute(READY)).toBe(true)
    expect(canOpenNotificationRoute({ ...READY, group: 'analyse' })).toBe(true)
    expect(canOpenNotificationRoute({ ...READY, group: 'offre', paywallShown: true })).toBe(true)
  })

  it('attend pendant le démarrage et les redirections', () => {
    expect(canOpenNotificationRoute({ ...READY, navReady: false })).toBe(false)
    expect(canOpenNotificationRoute({ ...READY, authLoading: true })).toBe(false)
    expect(canOpenNotificationRoute({ ...READY, signInPending: true })).toBe(false)
    expect(canOpenNotificationRoute({ ...READY, profileLoading: true })).toBe(false)
    expect(canOpenNotificationRoute({ ...READY, draftPending: true })).toBe(false)
    expect(canOpenNotificationRoute({ ...READY, guardTarget: 'home' })).toBe(false)
    expect(canOpenNotificationRoute({ ...READY, group: undefined })).toBe(false)
  })

  it('n ouvre rien sans session ni pendant les parcours', () => {
    expect(canOpenNotificationRoute({ ...READY, isAuthenticated: false })).toBe(false)
    for (const group of ['(auth)', '(preonboarding)', '(onboarding)', 'premium']) {
      expect(canOpenNotificationRoute({ ...READY, group })).toBe(false)
    }
    // /offre avant d'avoir vu le paywall = paywall de fin d'onboarding.
    expect(canOpenNotificationRoute({ ...READY, group: 'offre', paywallShown: false })).toBe(false)
  })
})
