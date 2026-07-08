/**
 * NotificationsInit — composant EFFET (ne rend rien) monté dans app/_layout.tsx.
 *
 * Responsabilités (toutes sous la garde `isNotificationsAvailable()`, jamais
 * bloquantes, aucun délai au cold start) :
 *   1. au montage : configure le handler + crée les canaux ;
 *   2. réconciliation idempotente du rappel hebdo dès que profil + permission
 *      sont connus (reprogramme si activé, annule si désactivé) ;
 *   3. deep link au tap d'une notification (à froid via getLastNotification
 *      ResponseAsync, à chaud via le listener) ;
 *   4. écoute NEW_HIGH_CONFLICTS_EVENT et présente une alerte pour le premier
 *      nouveau conflit high.
 *
 * JAMAIS de prompt de permission ici : l'opt-in se fait via la carte
 * post-premier-bilan (EnableNotificationsCard) ou les réglages du profil.
 */

import { useEffect } from 'react'
import { router } from 'expo-router'

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

/** Navigue si le payload data porte une route interne autorisée. */
function navigateFromData(data: unknown): void {
  const route = routeForNotificationData(data)
  if (route) {
    router.push(route as never)
  }
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
          const data = extractData(response)
          navigateFromData(data)
        },
      )
    } catch {
      // best-effort
    }

    // Cold start : l'app a été ouverte en tapant une notification.
    void (async () => {
      try {
        const last = await Notifications.getLastNotificationResponseAsync()
        if (last) navigateFromData(extractData(last))
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

  // 2. Rappel de bilan hebdo = notification DISTANTE (cron serveur + Expo Push).
  //    Ici on se contente d'enregistrer le token push de l'appareil quand les
  //    notifs sont activées + la permission accordée ; le cron
  //    (Edge send-weekly-bilan) pousse même app fermée. On annule tout ancien
  //    rappel LOCAL programmé par l'ancienne version (évite le double).
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

/** Extrait `content.data` d'une réponse de notification (forme tolérante). */
function extractData(response: unknown): unknown {
  if (!response || typeof response !== 'object') return null
  const r = response as { notification?: { request?: { content?: { data?: unknown } } } }
  return r.notification?.request?.content?.data ?? null
}
