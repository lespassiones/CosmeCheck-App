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
import { CHANNELS } from '@/lib/notifications/channels'
import { computeNextBilanTrigger, isoWeekdayToExpo } from '@/lib/notifications/planner'
import type { NotificationPrefs } from '@/lib/notifications/prefs'
import { isoWeekKey } from '@/lib/skin/week'

/** Statut de permission simplifié (indépendant de la forme du module natif). */
export type PermissionStatus = 'granted' | 'denied' | 'undetermined' | 'unavailable'

/** Identifier fixe du rappel de bilan (un seul programmé à la fois). */
const BILAN_IDENTIFIER = CHANNELS.bilan

/** Clés AsyncStorage. */
const LAST_BILAN_WEEK_KEY = 'cw:notif:lastBilanWeek'
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
 * Programme le rappel hebdo de bilan (identifier fixe, canal bilan). Annule
 * d'abord l'existant, puis programme selon `computeNextBilanTrigger` :
 * trigger hebdo répétitif INEXACT, ou one-shot si le bilan a déjà été fait
 * cette semaine ISO. Retourne false si indisponible ou en cas d'échec.
 */
export async function scheduleWeeklyBilan(
  weekday: number,
  hour: number,
  lastBilanWeek: string | null,
): Promise<boolean> {
  const Notifications = getNotificationsModule()
  if (!Notifications) return false
  try {
    await cancelIdentifier(Notifications, BILAN_IDENTIFIER)

    const plan = computeNextBilanTrigger(new Date(), weekday, hour, lastBilanWeek)
    const content = {
      title: 'Bilan peau de la semaine',
      body: "C'est l'heure de ton bilan peau de la semaine (45 secondes).",
      data: { url: '/peau' },
    }

    const types = Notifications.SchedulableTriggerInputTypes ?? {}
    let trigger: Record<string, unknown>
    if (plan.kind === 'weekly') {
      // Trigger hebdo INEXACT (weekday convention expo : 1 = dimanche).
      trigger = {
        type: types.WEEKLY ?? 'weekly',
        weekday: isoWeekdayToExpo(plan.weekday),
        hour: plan.hour,
        minute: plan.minute,
        channelId: CHANNELS.bilan,
      }
    } else {
      trigger = {
        type: types.TIME_INTERVAL ?? 'timeInterval',
        seconds: plan.seconds,
        repeats: false,
        channelId: CHANNELS.bilan,
      }
    }

    await Notifications.scheduleNotificationAsync({
      identifier: BILAN_IDENTIFIER,
      content,
      trigger,
    })
    return true
  } catch {
    return false
  }
}

/**
 * Annule toutes les notifications programmées dont l'identifier commence par le
 * préfixe donné (ex. 'bilan-hebdo', 'suivi-'). No-op si module absent.
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

/** Annule une notification programmée par identifier exact (interne). */
async function cancelIdentifier(Notifications: any, id: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(id)
  } catch {
    // pas de notification existante : ignoré.
  }
}

/**
 * À appeler à la COMPLETION d'un bilan : mémorise la semaine ISO courante
 * (AsyncStorage) puis reprogramme (one-shot semaine suivante).
 */
export async function rescheduleAfterBilan(prefs: NotificationPrefs): Promise<void> {
  const week = isoWeekKey()
  try {
    await AsyncStorage.setItem(LAST_BILAN_WEEK_KEY, week)
  } catch {
    // best-effort
  }
  await scheduleWeeklyBilan(prefs.bilanWeekday, prefs.bilanHour, week)
}

/** Semaine ISO du dernier bilan enregistré, ou null. */
export async function readLastBilanWeek(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(LAST_BILAN_WEEK_KEY)
  } catch {
    return null
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

/**
 * Stub phase 2 (canal créé, aucune programmation). Signature figée pour J+14.
 */
export async function scheduleSuiviProduit(
  _productName: string,
  _analysisId: string,
): Promise<boolean> {
  return false
}

/** Hash court et stable (djb2) d'une clé de dédup, pour un nom de clé compact. */
function hashKey(input: string): string {
  let h = 5381
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) | 0
  }
  return (h >>> 0).toString(36)
}
