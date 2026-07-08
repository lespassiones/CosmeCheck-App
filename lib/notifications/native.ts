/**
 * Garde d'accès au module natif `expo-notifications` (chargement PARESSEUX).
 *
 * QUOI : un accès unique et mémoïsé au module natif, via `require()` dans un
 * try/catch. Retourne `null` si le binaire ne contient PAS le module natif
 * (release OTA poussée AVANT le rebuild, Expo Go, tests node).
 *
 * POURQUOI : un `import` statique d'`expo-notifications` jette
 * `Cannot find native module 'ExpoNotifications'` dès l'évaluation du module
 * (donc au boot). On ne fait JAMAIS d'import top-level : tout passe par ce
 * require différé pour que l'app ne crashe jamais avant le rebuild natif.
 *
 * Le module est typé `any` à la frontière du require : tsc doit passer même
 * quand le package n'est pas encore installé (le lead l'installe après).
 */

// Volontairement `any` : le package peut ne pas être installé au typecheck.
type NotifModule = any // eslint-disable-line @typescript-eslint/no-explicit-any

let cached: NotifModule | null | undefined

/**
 * Le module natif `expo-notifications`, ou `null` s'il est absent du binaire.
 * Le résultat est mémoïsé (l'échec du require ne se rejoue pas à chaque appel).
 */
export function getNotificationsModule(): NotifModule | null {
  if (cached !== undefined) return cached
  try {
    // require différé : jamais d'import top-level (crash au boot sinon).
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const mod = require('expo-notifications')
    cached = mod ?? null
  } catch {
    cached = null
  }
  return cached
}

/** Vrai si le module natif est présent dans le binaire courant. */
export function isNotificationsAvailable(): boolean {
  return getNotificationsModule() !== null
}
