/**
 * Deep link des notifications (module PUR, testable en node).
 *
 * QUOI : extrait et VALIDE la route embarquée dans `data.url` d'une
 * notification locale, contre une allowlist stricte de routes internes.
 *
 * POURQUOI : le payload `data` d'une notification est une donnée non fiable
 * (contenu arbitraire, éventuellement forgé ou issu d'une ancienne version).
 * On ne navigue JAMAIS vers une route arbitraire : seule une correspondance
 * EXACTE avec l'allowlist autorise la navigation, tout le reste renvoie null
 * (pas d'URL externe, pas de préfixe malin type '/peau/../offre', pas de
 * query string). Si la route du bilan change, mettre à jour l'allowlist ET la
 * data `url` posée par le scheduler.
 */

/** Routes internes autorisées au tap d'une notification. Correspondance exacte. */
export const NOTIFICATION_ROUTE_ALLOWLIST = ['/(tabs)/routine', '/(tabs)'] as const

/**
 * Route de navigation pour un payload de notification, ou null si le payload
 * n'est pas un objet portant un `url` string EXACTEMENT égal à une entrée de
 * l'allowlist (jamais de navigation arbitraire).
 */
export function routeForNotificationData(data: unknown): string | null {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null
  const url = (data as Record<string, unknown>).url
  if (typeof url !== 'string') return null
  return (NOTIFICATION_ROUTE_ALLOWLIST as readonly string[]).includes(url) ? url : null
}
