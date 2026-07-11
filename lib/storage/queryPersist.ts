/**
 * React Query — persistance AsyncStorage.
 *
 * Le `QueryClient` mémoire est perdu à chaque cold start : on persiste
 * sélectivement les caches stables (profil, routine, history, dashboard) et on
 * EXCLUT ce qui doit toujours repartir frais : crédits (changent à chaque
 * analyse) et résultats d'Edge Functions IA (gérés par leur propre cache TTL).
 *
 * La logique de filtrage est exposée séparément (`shouldPersistQueryKey`) pour
 * être testée en pur, sans monter AsyncStorage.
 */

import type { Query } from '@tanstack/react-query'

/** Première clé d'une queryKey, en string (les autres segments sont ignorés). */
function rootKey(queryKey: unknown): string | null {
  if (!Array.isArray(queryKey) || queryKey.length === 0) return null
  const k = queryKey[0]
  return typeof k === 'string' ? k : null
}

/**
 * Décide si une `queryKey` doit être persistée à travers les sessions.
 *
 * BLACKLIST :
 *  - 'profile'           — pilote la porte d'onboarding ; ne doit jamais être
 *                          servi périmé au cold start (sinon flash dashboard).
 *  - 'credits'           — solde quotidien, doit toujours repartir frais.
 *  - 'ingredient-explain', 'compare-insights', 'routine-suggest'
 *                          — réponses IA cachées séparément avec leur TTL.
 *  - 'catalog-search'      — résultats de recherche, transients (staleTime 60s).
 *                          Aucun intérêt à les garder 7 jours sur disque.
 *  - 'alternatives', 'eanAnalysis', 'productByEan'
 *                          — pages de produits candidats et JSON d'analyses
 *                          complets, transients (staleTime 5-30 min). Persistés,
 *                          ils s'accumulent 7 jours et gonflent le blob
 *                          JSON.parse au cold start pour rien (même raison que
 *                          'catalog-search').
 *  - 'appConfig'           — feature flags + mode maintenance ; doit toujours
 *                          repartir frais (ne jamais servir un flag/maintenance
 *                          périmé au cold start).
 *
 * Tout le reste est persisté (routine, dashboard, history, ingredient,
 * dailyPicks, etc.).
 */
export function shouldPersistQueryKey(queryKey: unknown): boolean {
  const k = rootKey(queryKey)
  if (k == null) return false
  const BLACKLIST = new Set<string>([
    // Le profil pilote la porte d'onboarding (AuthGuard). Le persister sur
    // disque risque de router sur un `onboardingShown` PÉRIMÉ au cold start
    // (flash dashboard → retour onboarding). On le recharge frais à chaque
    // lancement (1 requête, négligeable) plutôt que de servir un état stale.
    'profile',
    'credits',
    'ingredient-explain',
    'compare-insights',
    'routine-suggest',
    'catalog-search',
    'alternatives',
    'eanAnalysis',
    'productByEan',
    'appConfig',
    // URLs signées de photos de visage : expirent (1h) ; ne jamais persister
    // sur disque, sinon vignettes cassées au cold start.
    'skinPhotoUrl',
  ])
  return !BLACKLIST.has(k)
}

/** Predicate `dehydrateOptions.shouldDehydrateQuery` attendue par react-query. */
export function shouldDehydrateQuery(query: Query): boolean {
  // Ne persiste que les requêtes complètes (sinon on rejoue des erreurs).
  if (query.state.status !== 'success') return false
  return shouldPersistQueryKey(query.queryKey)
}

/**
 * Bumper de version : modifier cette chaîne invalide TOUTE la cache persistée
 * (ex. quand un type change). Évite des erreurs de désérialisation en prod.
 */
// v2 : purge les blobs persistés avant l'ajout de 'alternatives'/'eanAnalysis'
// à la blacklist (ils pouvaient peser lourd au JSON.parse du cold start).
export const QUERY_PERSIST_BUSTER = 'cosmecheck-rq-v2'

/** Clé AsyncStorage utilisée par le persister. */
export const QUERY_PERSIST_KEY = 'cosmecheck:react-query-cache'

/** TTL max d'une cache persistée (au-delà : on repart de zéro). */
export const QUERY_PERSIST_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000 // 7 jours
