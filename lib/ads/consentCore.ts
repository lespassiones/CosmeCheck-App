/**
 * Consentement « mesure publicitaire Meta » : logique PURE (testée).
 *
 * iPhone : la source de vérité est la fenêtre système ATT (la personne peut la
 * changer dans Réglages, on la relit à chaque lancement). Android : un choix
 * dans l'app, rangé localement, retirable depuis le Profil (RGPD : refuser doit
 * être aussi simple qu'accepter, et le retrait possible à tout moment).
 */

export type AttStatus = 'granted' | 'denied' | 'undetermined' | 'unavailable'
export type StoredChoice = 'granted' | 'denied' | null

/** `ask` : jamais demandé, il faut poser la question. */
export type AdsConsent = 'granted' | 'denied' | 'ask'

export function resolveAdsConsent(input: {
  platform: 'ios' | 'android' | string
  att: AttStatus
  stored: StoredChoice
}): AdsConsent {
  if (input.platform === 'ios') {
    if (input.att === 'granted') return 'granted'
    if (input.att === 'undetermined') return 'ask'
    // Refusé, ou ATT indisponible (restriction parentale, MDM) : pas de suivi.
    return 'denied'
  }
  if (input.platform === 'android') {
    return input.stored ?? 'ask'
  }
  return 'denied'
}

/**
 * Un App ID Meta est une suite de chiffres. Tant que `app.json` porte le
 * gabarit, tout reste éteint (aucune question posée, aucun SDK démarré).
 */
export function isValidMetaAppId(appId: unknown): appId is string {
  return typeof appId === 'string' && /^\d{6,20}$/.test(appId)
}
