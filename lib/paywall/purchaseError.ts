/**
 * Lecture des erreurs d'achat RevenueCat.
 *
 * Le défaut corrigé le 28/08/2026 : l'annulation était détectée avec
 * `err.message.includes('PurchaseCancelled')`. Le SDK ne met pas ce texte dans
 * le message, il pose `code: '1'` et `userCancelled: true`. Résultat, fermer la
 * feuille de paiement Google Play ou App Store, ou simplement appuyer sur
 * Retour, déclenchait une alerte « Achat impossible ». Refuser d'acheter n'est
 * pas une panne, et le dire l'est encore moins.
 *
 * Deux autres cas méritaient mieux qu'un message d'échec générique :
 *   - `PAYMENT_PENDING_ERROR` : le paiement attend une validation externe
 *     (Demander à acheter d'un compte enfant, virement, carte à confirmer).
 *     L'abonnement peut s'activer plus tard, tout seul.
 *   - `PRODUCT_ALREADY_PURCHASED_ERROR` : l'abonnement existe déjà, il est
 *     rattaché à un autre compte de l'app. La bonne réponse est « Restaurer
 *     mes achats », pas « réessaie ».
 *
 * Module volontairement ignorant de `react-native-purchases` (il ne lit que des
 * champs), pour rester testable en environnement node.
 */

/** Ce qu'on peut dire à la personne, pas ce qui s'est passé techniquement. */
export type PurchaseOutcome =
  | 'cancelled' // rien à dire : la personne a fermé la feuille
  | 'pending' // paiement en attente de validation externe
  | 'already_owned' // abonnement déjà actif ailleurs -> restaurer
  | 'network' // hors ligne / réseau
  | 'store' // le magasin ne répond pas correctement
  | 'not_allowed' // achats interdits sur cet appareil (contrôle parental)
  | 'unknown'

/** Codes RevenueCat utilisés ici, en clair (`PURCHASES_ERROR_CODE`). */
const CODE = {
  CANCELLED: '1',
  STORE_PROBLEM: '2',
  NOT_ALLOWED: '3',
  ALREADY_PURCHASED: '6',
  NETWORK: '10',
  PAYMENT_PENDING: '20',
  OFFLINE: '35',
} as const

/** Lit `code` quelle que soit sa forme (le SDK renvoie une chaîne, pas un nombre). */
function readCode(err: unknown): string | null {
  if (!err || typeof err !== 'object') return null
  const code = (err as { code?: unknown }).code
  if (typeof code === 'string') return code
  if (typeof code === 'number') return String(code)
  return null
}

/**
 * L'achat a-t-il été annulé par la personne ?
 *
 * On regarde `userCancelled` ET le code : le champ est déprécié côté SDK et
 * peut valoir `null`, tandis que le code est la source recommandée. L'un ou
 * l'autre suffit.
 */
export function isUserCancelled(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  if ((err as { userCancelled?: unknown }).userCancelled === true) return true
  return readCode(err) === CODE.CANCELLED
}

/** Classe une erreur d'achat en un cas que l'interface sait présenter. */
export function classifyPurchaseError(err: unknown): PurchaseOutcome {
  if (isUserCancelled(err)) return 'cancelled'

  switch (readCode(err)) {
    case CODE.PAYMENT_PENDING:
      return 'pending'
    case CODE.ALREADY_PURCHASED:
      return 'already_owned'
    case CODE.NETWORK:
    case CODE.OFFLINE:
      return 'network'
    case CODE.STORE_PROBLEM:
      return 'store'
    case CODE.NOT_ALLOWED:
      return 'not_allowed'
    default:
      return 'unknown'
  }
}

/**
 * Titre et texte à afficher. `null` pour une annulation : on ne dérange pas
 * quelqu'un qui vient de dire non.
 *
 * `store` est le nom du magasin qui encaisse, passé par l'appelant : une app
 * iOS qui parle de Google Play se fait remarquer, et l'inverse aussi.
 */
export function purchaseErrorMessage(
  outcome: PurchaseOutcome,
  store: string,
): { title: string; body: string } | null {
  switch (outcome) {
    case 'cancelled':
      return null
    case 'pending':
      return {
        title: 'Paiement en attente',
        body:
          "Ton paiement doit encore être validé. L'abonnement s'activera tout seul " +
          'dès que ce sera fait, sans rien avoir à refaire.',
      }
    case 'already_owned':
      return {
        title: 'Abonnement déjà actif',
        body:
          `Cet abonnement est déjà rattaché à ton compte ${store}. Utilise ` +
          '« Restaurer mes achats » pour le récupérer ici.',
      }
    case 'network':
      return {
        title: 'Connexion perdue',
        body: 'Vérifie ta connexion internet, puis réessaie.',
      }
    case 'store':
      return {
        title: `${store} ne répond pas`,
        body: "Le magasin est momentanément indisponible. Réessaie dans un instant.",
      }
    case 'not_allowed':
      return {
        title: 'Achats désactivés',
        body:
          "Les achats ne sont pas autorisés sur cet appareil. Vérifie les " +
          'restrictions dans les réglages du téléphone.',
      }
    default:
      return {
        title: 'Achat impossible',
        body: `L'achat n'a pas pu aboutir. Réessaie dans un instant, ou vérifie ton compte ${store}.`,
      }
  }
}
