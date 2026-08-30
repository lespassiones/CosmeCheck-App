/**
 * PostHog mobile (projet « Cosme Check », EU) — accès PARESSEUX et OTA-safe.
 *
 * QUOI : un client unique memoïsé + helpers de capture. Les événements produit
 * portent les MÊMES noms que le web (signup, onboarding_completed,
 * scan_completed, routine_item_added) + la super-propriété platform='mobile' →
 * le dashboard PostHog « Cosme Check — Mobile + Web » agrège les deux.
 *
 * POURQUOI un require différé (comme lib/notifications/native.ts) :
 * posthog-react-native s'appuie sur des modules natifs Expo (device,
 * application, localization) absents des binaires pré-rebuild. Tout passe par
 * un try/catch memoïsé : binaire sans les modules = analytics no-op, jamais de
 * crash. `premium_started` n'est PAS capturé ici : il part du webhook
 * RevenueCat (source de vérité serveur, pas de double comptage).
 */

// Token PUBLIC d'ingestion (write-only), pas un secret.
const POSTHOG_KEY = 'phc_nVe87LGmXqMGcsovsqoL9mWocA9sDP9U4KVsUhGk9fqz'
const POSTHOG_HOST = 'https://eu.i.posthog.com'

// Volontairement `any` : le package peut être absent du binaire (pré-rebuild).
type PostHogClient = any // eslint-disable-line @typescript-eslint/no-explicit-any

let cached: PostHogClient | null | undefined

function getClient(): PostHogClient | null {
  if (cached !== undefined) return cached
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const { PostHog } = require('posthog-react-native')
    // Mesure d'audience ANONYME (exemptée de consentement CNIL) : pas de session
    // replay, pas de capture automatique des interactions. On ne relie l'ID
    // technique Supabase QUE comme distinct_id (aucun email/nom transmis, cf.
    // phIdentify + useAuth). Aucune donnée nominative ne part vers PostHog.
    cached = new PostHog(POSTHOG_KEY, {
      host: POSTHOG_HOST,
      enableSessionReplay: false,
    })
    cached.register({ platform: 'mobile' })
  } catch {
    cached = null
  }
  return cached
}

export type ProductEvent =
  | 'signup'
  | 'data_consent_granted'
  | 'onboarding_completed'
  | 'scan_completed'
  | 'routine_item_added'

/** Capture un événement produit (no-op si module absent). */
export function phCapture(event: ProductEvent, properties?: Record<string, unknown>): void {
  try {
    getClient()?.capture(event, properties)
  } catch {
    // best-effort : l'analytics ne casse jamais un parcours utilisateur.
  }
}

/** Relie l'utilisateur connecté (distinct_id = user id Supabase, comme le web). */
export function phIdentify(userId: string, properties?: Record<string, unknown>): void {
  try {
    getClient()?.identify(userId, properties)
  } catch {
    // best-effort
  }
}

/** Déconnexion : repart sur un profil anonyme. */
export function phReset(): void {
  try {
    getClient()?.reset()
  } catch {
    // best-effort
  }
}
