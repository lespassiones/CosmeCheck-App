/**
 * Deep link des notifications (lib/notifications/deepLink.ts).
 *
 * POURQUOI ces tests : le payload `data` d'une notification n'est PAS fiable ;
 * la navigation au tap ne doit se faire que vers une route interne de
 * l'allowlist, en correspondance EXACTE. On verrouille le refus des URLs
 * externes, des routes internes hors liste, des variantes maquillées
 * (préfixe, query string, traversal) et des payloads non conformes.
 */

import {
  NOTIFICATION_ROUTE_ALLOWLIST,
  routeForNotificationData,
} from '@/lib/notifications/deepLink'

describe('routeForNotificationData : routes autorisées', () => {
  it('accepte /(tabs)/routine (alerte conflit)', () => {
    expect(routeForNotificationData({ url: '/(tabs)/routine' })).toBe('/(tabs)/routine')
  })

  it('accepte /(tabs) (accueil)', () => {
    expect(routeForNotificationData({ url: '/(tabs)' })).toBe('/(tabs)')
  })

  it('toute entrée de l allowlist est acceptée telle quelle', () => {
    for (const route of NOTIFICATION_ROUTE_ALLOWLIST) {
      expect(routeForNotificationData({ url: route })).toBe(route)
    }
  })
})

describe('routeForNotificationData : refus strict', () => {
  it('refuse une URL externe', () => {
    expect(routeForNotificationData({ url: 'https://evil.com' })).toBeNull()
  })

  it('refuse une route interne hors allowlist', () => {
    expect(routeForNotificationData({ url: '/offre' })).toBeNull()
    // /peau retiré : la feature « score de peau » a été supprimée de l'app.
    expect(routeForNotificationData({ url: '/peau' })).toBeNull()
  })

  it('refuse les variantes maquillées (préfixe, query, traversal, casse)', () => {
    expect(routeForNotificationData({ url: '/peau/' })).toBeNull()
    expect(routeForNotificationData({ url: '/peau?x=1' })).toBeNull()
    expect(routeForNotificationData({ url: '/peau/../offre' })).toBeNull()
    expect(routeForNotificationData({ url: '/PEAU' })).toBeNull()
    expect(routeForNotificationData({ url: ' /peau' })).toBeNull()
  })

  it('refuse un url non-string', () => {
    expect(routeForNotificationData({ url: 42 })).toBeNull()
    expect(routeForNotificationData({ url: null })).toBeNull()
    expect(routeForNotificationData({ url: ['/peau'] })).toBeNull()
    expect(routeForNotificationData({})).toBeNull()
  })

  it('refuse un payload non-objet', () => {
    expect(routeForNotificationData(null)).toBeNull()
    expect(routeForNotificationData(undefined)).toBeNull()
    expect(routeForNotificationData('/peau')).toBeNull()
    expect(routeForNotificationData(7)).toBeNull()
    expect(routeForNotificationData([{ url: '/peau' }])).toBeNull()
  })
})
