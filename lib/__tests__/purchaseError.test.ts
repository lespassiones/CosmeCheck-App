/**
 * Lecture des erreurs d'achat RevenueCat.
 *
 * Le defaut d'origine, reproduit ici : l'annulation etait detectee avec
 * `err.message.includes('PurchaseCancelled')`. Le SDK ne met pas ce texte dans
 * le message, donc fermer la feuille de paiement affichait « Achat impossible »
 * a quelqu'un qui avait simplement change d'avis.
 */
import {
  classifyPurchaseError,
  isUserCancelled,
  purchaseErrorMessage,
} from '@/lib/paywall/purchaseError'

/** Forme reelle d'une erreur react-native-purchases. */
const rcError = (code: string, extra: Record<string, unknown> = {}) => ({
  code,
  message: 'Purchase was cancelled.',
  readableErrorCode: 'PURCHASE_CANCELLED',
  userInfo: { readableErrorCode: 'PURCHASE_CANCELLED' },
  underlyingErrorMessage: '',
  userCancelled: null,
  ...extra,
})

describe('isUserCancelled', () => {
  it('REGRESSION : annulation reconnue par le CODE, pas par le message', () => {
    // Le message du SDK ne contient pas « PurchaseCancelled ». C'est
    // exactement ce que l'ancienne detection cherchait, d'ou l'alerte a tort.
    const err = rcError('1')
    expect(err.message.includes('PurchaseCancelled')).toBe(false)
    expect(isUserCancelled(err)).toBe(true)
  })

  it('annulation reconnue par userCancelled quand le champ est renseigne', () => {
    expect(isUserCancelled(rcError('0', { userCancelled: true }))).toBe(true)
  })

  it('code numerique (et pas chaine) accepte aussi', () => {
    expect(isUserCancelled({ code: 1 })).toBe(true)
  })

  it('une vraie panne n\'est pas une annulation', () => {
    expect(isUserCancelled(rcError('2'))).toBe(false)
    expect(isUserCancelled(new Error('boom'))).toBe(false)
    expect(isUserCancelled(null)).toBe(false)
    expect(isUserCancelled(undefined)).toBe(false)
    expect(isUserCancelled('erreur')).toBe(false)
  })

  it('userCancelled a null ne vaut pas annulation', () => {
    expect(isUserCancelled(rcError('2', { userCancelled: null }))).toBe(false)
  })
})

describe('classifyPurchaseError', () => {
  const cas: Array<[string, string, string]> = [
    ['1', 'cancelled', 'annulation'],
    ['20', 'pending', 'paiement en attente de validation'],
    ['6', 'already_owned', 'deja abonne ailleurs'],
    ['10', 'network', 'reseau'],
    ['35', 'network', 'hors ligne'],
    ['2', 'store', 'magasin en panne'],
    ['3', 'not_allowed', 'achats interdits sur l appareil'],
    ['0', 'unknown', 'inconnu'],
    ['42', 'unknown', 'code non traite'],
  ]

  it.each(cas)('code %s -> %s (%s)', (code, expected) => {
    expect(classifyPurchaseError(rcError(code))).toBe(expected)
  })

  it('erreur non RevenueCat -> inconnu', () => {
    expect(classifyPurchaseError(new Error('reseau'))).toBe('unknown')
  })
})

describe('purchaseErrorMessage', () => {
  it('annulation -> AUCUN message (on ne derange pas qui vient de dire non)', () => {
    expect(purchaseErrorMessage('cancelled', 'App Store')).toBeNull()
  })

  it('nomme le magasin passe par l\'appelant, jamais l\'autre', () => {
    const ios = purchaseErrorMessage('already_owned', 'App Store')
    expect(ios?.body).toContain('App Store')
    expect(ios?.body).not.toContain('Google Play')

    const android = purchaseErrorMessage('store', 'Google Play')
    expect(android?.title).toContain('Google Play')
    expect(android?.title).not.toContain('App Store')
  })

  it('paiement en attente : dit que ca s\'activera seul, pas que c\'est rate', () => {
    const msg = purchaseErrorMessage('pending', 'Google Play')
    expect(msg?.title).toBe('Paiement en attente')
    expect(msg?.body).toContain('activera')
  })

  it('deja abonne : oriente vers la restauration, pas vers un nouvel essai', () => {
    const msg = purchaseErrorMessage('already_owned', 'App Store')
    expect(msg?.body).toContain('Restaurer mes achats')
  })

  it('aucun message ne parle de build signe ni d\'emulateur', () => {
    // L'ancien texte expliquait a l'utilisateur les contraintes de
    // distribution des achats in-app. Ce n'est pas son probleme.
    const outcomes = [
      'pending',
      'already_owned',
      'network',
      'store',
      'not_allowed',
      'unknown',
    ] as const
    for (const o of outcomes) {
      const msg = purchaseErrorMessage(o, 'App Store')
      const texte = `${msg?.title ?? ''} ${msg?.body ?? ''}`.toLowerCase()
      expect(texte).not.toContain('build')
      expect(texte).not.toContain('émulateur')
      expect(texte).not.toContain('emulateur')
      expect(texte).not.toContain('test interne')
    }
  })
})
