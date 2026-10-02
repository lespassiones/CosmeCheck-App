import { isValidMetaAppId, resolveAdsConsent } from '@/lib/ads/consentCore'

describe('resolveAdsConsent', () => {
  it('iPhone : seule l’autorisation ATT compte', () => {
    expect(resolveAdsConsent({ platform: 'ios', att: 'granted', stored: null })).toBe('granted')
    expect(resolveAdsConsent({ platform: 'ios', att: 'undetermined', stored: null })).toBe('ask')
    expect(resolveAdsConsent({ platform: 'ios', att: 'denied', stored: 'granted' })).toBe('denied')
    // Restriction parentale / MDM : pas de suivi, pas de question.
    expect(resolveAdsConsent({ platform: 'ios', att: 'unavailable', stored: null })).toBe('denied')
  })

  it('Android : le choix rangé dans l’app, sinon on demande', () => {
    expect(resolveAdsConsent({ platform: 'android', att: 'unavailable', stored: null })).toBe('ask')
    expect(resolveAdsConsent({ platform: 'android', att: 'unavailable', stored: 'granted' })).toBe(
      'granted',
    )
    expect(resolveAdsConsent({ platform: 'android', att: 'unavailable', stored: 'denied' })).toBe(
      'denied',
    )
  })

  it('autre plateforme (web) : jamais de suivi', () => {
    expect(resolveAdsConsent({ platform: 'web', att: 'unavailable', stored: 'granted' })).toBe(
      'denied',
    )
  })
})

describe('isValidMetaAppId', () => {
  it('refuse le gabarit de app.json', () => {
    expect(isValidMetaAppId('REMPLACER_PAR_APP_ID_META')).toBe(false)
    expect(isValidMetaAppId('')).toBe(false)
    expect(isValidMetaAppId(undefined)).toBe(false)
    expect(isValidMetaAppId(1234567890)).toBe(false)
  })

  it('accepte un vrai App ID (chiffres)', () => {
    expect(isValidMetaAppId('1234567890123456')).toBe(true)
  })
})
