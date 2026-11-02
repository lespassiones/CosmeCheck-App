/**
 * Destination d'une notification tapée, en attente du bon moment pour y aller
 * (module PUR, testable en node).
 *
 * POURQUOI : au tap d'une notification app FERMÉE (le cas le plus courant),
 * la réponse arrive pendant le démarrage, avant que le navigateur racine soit
 * monté et que l'AuthGuard ait tranché. Une navigation émise à ce moment est
 * refusée en silence par expo-router, ou écrasée par la redirection du guard :
 * la personne atterrissait sur l'accueil quelle que soit la notification.
 *
 * Désormais `NotificationsInit` DÉPOSE la route ici et l'`AuthGuard` la
 * consomme une seule fois, quand `canOpenNotificationRoute` dit que l'app est
 * posée (connecté, profil lu, aucune redirection en cours, hors parcours).
 */

/** Au-delà, une destination non ouverte est oubliée (ex. tap puis déconnexion). */
export const PENDING_ROUTE_TTL_MS = 10 * 60 * 1000

let pending: { route: string; at: number } | null = null
const abonnes = new Set<() => void>()

function prevenir(): void {
  for (const f of abonnes) f()
}

/** S'abonner aux changements (pour `useSyncExternalStore` dans l'AuthGuard). */
export function subscribePendingNotificationRoute(ecouteur: () => void): () => void {
  abonnes.add(ecouteur)
  return () => {
    abonnes.delete(ecouteur)
  }
}

/** Route en attente, ou null (aucune, ou trop ancienne). */
export function getPendingNotificationRoute(now: number = Date.now()): string | null {
  if (!pending) return null
  return now - pending.at <= PENDING_ROUTE_TTL_MS ? pending.route : null
}

/** Dépose la destination d'un tap (remplace une éventuelle précédente). */
export function setPendingNotificationRoute(route: string, now: number = Date.now()): void {
  pending = { route, at: now }
  prevenir()
}

/** Retire et rend la destination en attente (une notification = une navigation). */
export function takePendingNotificationRoute(now: number = Date.now()): string | null {
  const route = getPendingNotificationRoute(now)
  if (pending) {
    pending = null
    prevenir()
  }
  return route
}

export interface NotificationRouteGate {
  /** Le navigateur racine est monté (`useRootNavigationState().key`). */
  navReady: boolean
  authLoading: boolean
  signInPending: boolean
  isAuthenticated: boolean
  profileLoading: boolean
  draftPending: boolean
  paywallShown: boolean
  /** La décision de l'AuthGuard pour ce rendu : null = aucune redirection. */
  guardTarget: string | null
  /** `segments[0]` d'expo-router. */
  group: string | undefined
}

/**
 * L'app est-elle posée sur un écran ordinaire, sans redirection en cours ?
 * Sinon on attend : la destination reste déposée et sera ouverte au prochain
 * passage du guard (fin du paywall, fin de l'écriture du parcours…).
 */
export function canOpenNotificationRoute(g: NotificationRouteGate): boolean {
  if (!g.navReady || g.authLoading || g.signInPending || !g.isAuthenticated) return false
  if (g.profileLoading || g.draftPending || g.guardTarget !== null) return false
  if (!g.group) return false
  if (
    g.group === '(auth)' ||
    g.group === '(preonboarding)' ||
    g.group === '(onboarding)' ||
    g.group === 'premium'
  ) {
    return false
  }
  // /offre tant que le paywall n'a pas été vu = paywall de fin d'onboarding.
  if (g.group === 'offre' && !g.paywallShown) return false
  return true
}
