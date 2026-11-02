/**
 * NotificationsInit — composant EFFET (ne rend rien) monté dans app/_layout.tsx.
 *
 * Responsabilités (toutes sous la garde `isNotificationsAvailable()`, jamais
 * bloquantes, aucun délai au cold start) :
 *   1. au montage : configure le handler + crée les canaux ;
 *   2. enregistre le token push (notifications distantes) dès que profil +
 *      permission sont connus, et purge d'éventuels rappels locaux hérités ;
 *   3. deep link au tap d'une notification (à froid via getLastNotification
 *      ResponseAsync, à chaud via le listener) : la route est DÉPOSÉE dans
 *      `lib/notifications/pendingRoute`, l'AuthGuard l'ouvre quand l'app est
 *      posée (à froid, une navigation immédiate était perdue => accueil).
 *
 * JAMAIS de prompt de permission ici : l'opt-in se fait via les réglages du
 * profil (section Notifications).
 */

import { useEffect } from 'react'

import { useProfile } from '@/hooks/useProfile'
import { getNotificationsModule, isNotificationsAvailable } from '@/lib/notifications/native'
import { ensureChannels } from '@/lib/notifications/channels'
import {
  cancelByChannel,
  getPermissionStatus,
  setupNotificationHandler,
} from '@/lib/notifications/scheduler'
import { registerPushToken } from '@/lib/notifications/pushToken'
import { readNotificationPrefs } from '@/lib/notifications/prefs'
import { routeForNotificationData } from '@/lib/notifications/deepLink'
import { setPendingNotificationRoute } from '@/lib/notifications/pendingRoute'

/**
 * Identifiants des taps déjà traités : à froid, le listener ET
 * getLastNotificationResponseAsync peuvent livrer le même tap (double
 * navigation). Un tap = une navigation.
 */
const handledResponses = new Set<string>()

/** Dépose la route si la notification tapée porte une route interne autorisée. */
function navigateFromResponse(response: unknown): void {
  const id = responseIdentifier(response)
  if (id) {
    if (handledResponses.has(id)) return
    handledResponses.add(id)
  }
  const route = routeForNotificationData(extractData(response))
  if (!route) return
  // La navigation elle-même est faite par l'AuthGuard (app/_layout.tsx).
  setPendingNotificationRoute(route)
}

export function NotificationsInit(): null {
  const { profile, isLoading } = useProfile()

  // 1. Handler + canaux : une seule fois au montage.
  useEffect(() => {
    if (!isNotificationsAvailable()) return
    setupNotificationHandler()
    void ensureChannels()
  }, [])

  // 3. Deep link : listener (chaud) + réponse initiale (froid).
  useEffect(() => {
    if (!isNotificationsAvailable()) return
    const Notifications = getNotificationsModule()
    if (!Notifications) return

    let subscription: { remove: () => void } | null = null
    try {
      subscription = Notifications.addNotificationResponseReceivedListener(
        (response: unknown) => {
          navigateFromResponse(response)
          clearLastResponse(Notifications)
        },
      )
    } catch {
      // best-effort
    }

    // Cold start : l'app a été ouverte en tapant une notification.
    void (async () => {
      try {
        const last = await Notifications.getLastNotificationResponseAsync()
        if (last) {
          navigateFromResponse(last)
          // Sinon la même réponse revient aux lancements suivants : maintenant
          // que la destination s'ouvre à coup sûr, l'app rouvrirait cette page
          // à chaque démarrage.
          clearLastResponse(Notifications)
        }
      } catch {
        // best-effort
      }
    })()

    return () => {
      try {
        subscription?.remove()
      } catch {
        // best-effort
      }
    }
  }, [])

  // 2. Notifications DISTANTES (cron serveur + Expo Push) : on enregistre le
  //    token push de l'appareil quand les notifs sont activées + permission
  //    accordée, pour que le serveur (edge push-dispatch) puisse pousser même
  //    app fermée. On purge tout ancien rappel LOCAL hérité (bilan/suivi).
  useEffect(() => {
    if (!isNotificationsAvailable()) return
    if (isLoading) return

    void (async () => {
      const prefs = readNotificationPrefs(
        (profile?.preferences as Record<string, unknown> | null | undefined)?.notifications as
          | Record<string, unknown>
          | null
          | undefined,
      )
      // Nettoie l'éventuel rappel local hérité (le hebdo est distant désormais).
      await cancelByChannel('bilan-hebdo')
      if (!prefs.enabled) return
      const status = await getPermissionStatus()
      if (status !== 'granted') return
      await registerPushToken()
    })()
  }, [isLoading, profile?.preferences])

  return null
}

/** Oublie la dernière réponse mémorisée par le module (API selon la version). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function clearLastResponse(Notifications: any): void {
  try {
    if (typeof Notifications.clearLastNotificationResponse === 'function') {
      Notifications.clearLastNotificationResponse()
    } else if (typeof Notifications.clearLastNotificationResponseAsync === 'function') {
      void Notifications.clearLastNotificationResponseAsync().catch(() => {})
    }
  } catch {
    // best-effort
  }
}

/** Extrait `content.data` d'une réponse de notification (forme tolérante). */
function responseIdentifier(response: unknown): string | null {
  if (!response || typeof response !== 'object') return null
  const r = response as { notification?: { request?: { identifier?: unknown } } }
  const id = r.notification?.request?.identifier
  return typeof id === 'string' && id ? id : null
}

function extractData(response: unknown): unknown {
  if (!response || typeof response !== 'object') return null
  const r = response as { notification?: { request?: { content?: { data?: unknown } } } }
  return r.notification?.request?.content?.data ?? null
}
