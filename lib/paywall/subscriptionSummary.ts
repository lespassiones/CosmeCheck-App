/**
 * subscriptionSummary : ce que la page « Mon abonnement » affiche, déduit de
 * l'abonnement actif renvoyé par RevenueCat (entitlement `premium`).
 *
 * Logique pure (aucun import natif) pour être testée en Jest :
 *   - Formule : Annuelle / Mensuelle d'après l'identifiant produit (Google Play
 *     peut suffixer l'identifiant, ex. « premium_yearly:annual »).
 *   - Essai : date de fin seulement si la période en cours est un essai.
 *   - Renouvellement : date de prochain prélèvement si le renouvellement est
 *     actif, sinon « Désactivé » + date de fin d'accès.
 *   - Magasin : celui qui encaisse (App Store / Google Play), pour le bouton
 *     « Gérer dans… ».
 */

export interface EntitlementLike {
  productIdentifier: string
  periodType: string
  willRenew: boolean
  expirationDate: string | null
  store: string
}

export interface CustomerInfoLike {
  entitlements: { active: Record<string, EntitlementLike | undefined> }
  managementURL: string | null
}

export interface SummaryRow {
  label: string
  value: string
}

export interface SubscriptionSummary {
  /** Lignes du tableau, dans l'ordre d'affichage (hors crédits). */
  rows: SummaryRow[]
  /** « App Store » ou « Google Play ». */
  storeName: string
  /** Lien de gestion fourni par RevenueCat, null si inconnu. */
  managementUrl: string | null
}

const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']

/** « 1 oct. » */
export function shortDate(d: Date): string {
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}

/** « 12 oct. 2027 » */
export function longDate(d: Date): string {
  return `${shortDate(d)} ${d.getFullYear()}`
}

export function planLabel(productIdentifier: string): string | null {
  const id = productIdentifier.toLowerCase()
  if (id.includes('yearly') || id.includes('annual')) return 'Annuelle'
  if (id.includes('monthly')) return 'Mensuelle'
  return null
}

export function storeLabel(store: string | null | undefined, platformOS: string): string {
  if (store === 'PLAY_STORE') return 'Google Play'
  if (store === 'APP_STORE' || store === 'MAC_APP_STORE') return 'App Store'
  return platformOS === 'ios' ? 'App Store' : 'Google Play'
}

export function summarizeSubscription(
  info: CustomerInfoLike | null,
  platformOS: string,
): SubscriptionSummary {
  const ent = info?.entitlements.active.premium
  const storeName = storeLabel(ent?.store, platformOS)
  const managementUrl = info?.managementURL ?? null
  if (!ent) return { rows: [], storeName, managementUrl }

  const rows: SummaryRow[] = []
  const plan = planLabel(ent.productIdentifier)
  if (plan) rows.push({ label: 'Formule', value: plan })

  const exp = ent.expirationDate ? new Date(ent.expirationDate) : null
  const validExp = exp && !Number.isNaN(exp.getTime()) ? exp : null
  const trial = ent.periodType === 'TRIAL'

  if (trial && validExp) rows.push({ label: 'Essai', value: `Se termine le ${shortDate(validExp)}` })

  if (ent.willRenew) {
    if (validExp) rows.push({ label: 'Renouvellement', value: longDate(validExp) })
  } else {
    rows.push({ label: 'Renouvellement', value: 'Désactivé' })
    // En essai, la ligne « Essai » donne déjà la date de fin.
    if (!trial && validExp) rows.push({ label: 'Accès jusqu’au', value: longDate(validExp) })
  }

  return { rows, storeName, managementUrl }
}
