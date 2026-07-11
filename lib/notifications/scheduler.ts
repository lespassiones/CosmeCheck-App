/**
 * Orchestration native des notifications locales (best-effort, no-op si module
 * absent). Toutes les fonctions sont enveloppées dans un try/catch : un binaire
 * OTA pré-rebuild ne crashe jamais, les appels deviennent des no-op silencieux.
 *
 * La logique de DÉCISION (forme du trigger, dédup, conversion de jour) vit dans
 * `lib/notifications/planner.ts` (pur, testé). Ce module ne fait qu'EXÉCUTER le
 * plan via l'API native.
 */

import AsyncStorage from '@react-native-async-storage/async-storage'

import { getNotificationsModule } from '@/lib/notifications/native'

/** Statut de permission simplifié (indépendant de la forme du module natif). */
export type PermissionStatus = 'granted' | 'denied' | 'undetermined' | 'unavailable'

/** Clé AsyncStorage de dédup des alertes conflit. */
const CONFLICT_KEY_PREFIX = 'cw:notif:conflict:'

/**
 * Configure le handler de présentation en avant-plan. Bannière + liste
 * affichées, pas de son, pas de badge. No-op si module absent.
 */
export function setupNotificationHandler(): void {
  const Notifications = getNotificationsModule()
  if (!Notifications) return
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
        // Champs hérités (SDK antérieurs) : inoffensifs.
        shouldShowAlert: true,
      }),
    })
  } catch {
    // best-effort
  }
}

/** Statut de permission courant, ou 'unavailable' si le module natif est absent. */
export async function getPermissionStatus(): Promise<PermissionStatus> {
  const Notifications = getNotificationsModule()
  if (!Notifications) return 'unavailable'
  try {
    const res = await Notifications.getPermissionsAsync()
    return normalizeStatus(res)
  } catch {
    return 'unavailable'
  }
}

/** Déclenche le prompt natif (POST_NOTIFICATIONS sur Android 13+). */
export async function requestPermission(): Promise<boolean> {
  const Notifications = getNotificationsModule()
  if (!Notifications) return false
  try {
    const res = await Notifications.requestPermissionsAsync()
    return normalizeStatus(res) === 'granted'
  } catch {
    return false
  }
}

/** Normalise la réponse de permission expo-notifications en statut simple. */
function normalizeStatus(res: unknown): PermissionStatus {
  if (!res || typeof res !== 'object') return 'undetermined'
  const r = res as { status?: string; granted?: boolean }
  if (r.granted === true || r.status === 'granted') return 'granted'
  if (r.status === 'denied') return 'denied'
  return 'undetermined'
}

/**
 * Annule toutes les notifications programmées dont l'identifier commence par le
 * préfixe donné (ex. 'bilan-hebdo', 'suivi-'). No-op si module absent. Sert à
 * purger d'éventuels rappels locaux hérités d'anciennes versions.
 */
export async function cancelByChannel(channelPrefix: string): Promise<void> {
  const Notifications = getNotificationsModule()
  if (!Notifications) return
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync()
    if (!Array.isArray(scheduled)) return
    for (const req of scheduled) {
      const id = req?.identifier
      if (typeof id === 'string' && id.startsWith(channelPrefix)) {
        await Notifications.cancelScheduledNotificationAsync(id)
      }
    }
  } catch {
    // best-effort
  }
}

/**
 * Notification locale IMMÉDIATE (trigger null) sur le canal conflits, avec
 * dédoublonnage : une clé AsyncStorage `cw:notif:conflict:<hash>` est posée
 * pour la semaine. Si elle existe déjà, on ne re-notifie pas. Retourne true si
 * une notification a été présentée.
 */
export async function scheduleConflictAlert(
  title: string,
  body: string,
  dedupKey: string,
): Promise<boolean> {
  const Notifications = getNotificationsModule()
  if (!Notifications) return false

  const storageKey = CONFLICT_KEY_PREFIX + hashKey(dedupKey)
  try {
    const already = await AsyncStorage.getItem(storageKey)
    if (already) return false
  } catch {
    // en cas d'échec de lecture, on continue (mieux vaut notifier que rater).
  }

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: { url: '/(tabs)/routine' },
      },
      trigger: null,
    })
  } catch {
    return false
  }

  try {
    await AsyncStorage.setItem(storageKey, String(Date.now()))
  } catch {
    // le marqueur n'a pas pu être posé : au pire une alerte en double.
  }
  return true
}

/** Hash court et stable (djb2) d'une clé de dédup, pour un nom de clé compact. */
function hashKey(input: string): string {
  let h = 5381
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) | 0
  }
  return (h >>> 0).toString(36)
}
