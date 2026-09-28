/**
 * subscriptionSummary : lignes de la page « Mon abonnement » déduites de
 * l'entitlement RevenueCat `premium`.
 */
import {
  longDate,
  planLabel,
  shortDate,
  storeLabel,
  summarizeSubscription,
  type CustomerInfoLike,
  type EntitlementLike,
} from '@/lib/paywall/subscriptionSummary'

function info(ent: Partial<EntitlementLike> | null, managementURL: string | null = null): CustomerInfoLike {
  return {
    managementURL,
    entitlements: {
      active: ent
        ? {
            premium: {
              productIdentifier: 'premium_yearly',
              periodType: 'NORMAL',
              willRenew: true,
              expirationDate: '2027-10-12T10:00:00Z',
              store: 'APP_STORE',
              ...ent,
            },
          }
        : {},
    },
  }
}

describe('dates', () => {
  it('format court et long en français', () => {
    expect(shortDate(new Date(2026, 9, 1))).toBe('1 oct.')
    expect(longDate(new Date(2027, 9, 12))).toBe('12 oct. 2027')
    expect(longDate(new Date(2027, 7, 3))).toBe('3 août 2027')
  })
})

describe('planLabel / storeLabel', () => {
  it('reconnaît la formule, même suffixée par Google Play', () => {
    expect(planLabel('premium_yearly')).toBe('Annuelle')
    expect(planLabel('premium_yearly:annual-base')).toBe('Annuelle')
    expect(planLabel('premium_monthly')).toBe('Mensuelle')
    expect(planLabel('autre')).toBeNull()
  })

  it('nomme le magasin qui encaisse, sinon celui de l’appareil', () => {
    expect(storeLabel('PLAY_STORE', 'ios')).toBe('Google Play')
    expect(storeLabel('APP_STORE', 'android')).toBe('App Store')
    expect(storeLabel(undefined, 'ios')).toBe('App Store')
    expect(storeLabel('PROMOTIONAL', 'android')).toBe('Google Play')
  })
})

describe('summarizeSubscription', () => {
  it('abonnement annuel en cours : formule + renouvellement', () => {
    const s = summarizeSubscription(info({}, 'https://apps.apple.com/account/subscriptions'), 'ios')
    expect(s.rows).toEqual([
      { label: 'Formule', value: 'Annuelle' },
      { label: 'Renouvellement', value: longDate(new Date('2027-10-12T10:00:00Z')) },
    ])
    expect(s.storeName).toBe('App Store')
    expect(s.managementUrl).toBe('https://apps.apple.com/account/subscriptions')
  })

  it('essai : ligne Essai avec la date de fin, puis renouvellement', () => {
    const s = summarizeSubscription(
      info({ periodType: 'TRIAL', expirationDate: '2026-10-01T12:00:00Z' }),
      'ios',
    )
    const end = new Date('2026-10-01T12:00:00Z')
    expect(s.rows).toEqual([
      { label: 'Formule', value: 'Annuelle' },
      { label: 'Essai', value: `Se termine le ${shortDate(end)}` },
      { label: 'Renouvellement', value: longDate(end) },
    ])
  })

  it('renouvellement coupé : « Désactivé » + date de fin d’accès', () => {
    const s = summarizeSubscription(info({ willRenew: false, productIdentifier: 'premium_monthly' }), 'android')
    expect(s.rows).toEqual([
      { label: 'Formule', value: 'Mensuelle' },
      { label: 'Renouvellement', value: 'Désactivé' },
      { label: 'Accès jusqu’au', value: longDate(new Date('2027-10-12T10:00:00Z')) },
    ])
  })

  it('essai non renouvelé : pas de doublon de date', () => {
    const s = summarizeSubscription(info({ periodType: 'TRIAL', willRenew: false }), 'ios')
    expect(s.rows.map((r) => r.label)).toEqual(['Formule', 'Essai', 'Renouvellement'])
  })

  it('aucun entitlement actif (ou SDK indisponible) : aucune ligne', () => {
    expect(summarizeSubscription(info(null), 'ios').rows).toEqual([])
    expect(summarizeSubscription(null, 'android')).toEqual({
      rows: [],
      storeName: 'Google Play',
      managementUrl: null,
    })
  })
})
