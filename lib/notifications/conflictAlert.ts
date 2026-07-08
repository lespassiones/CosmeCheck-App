/**
 * Contrat public pour le moteur déterministe de conflits de routine.
 *
 * QUOI : `notifyConflictDetected` est le SEUL point d'entrée que le moteur de
 * conflits doit appeler après détection d'un conflit high inédit. Il vérifie
 * les préférences, la permission et la dédup de semaine, puis délègue au
 * scheduler natif. Le moteur ne touche JAMAIS expo-notifications directement.
 */

import { conflictDedupKey } from '@/lib/notifications/planner'
import type { NotificationPrefs } from '@/lib/notifications/prefs'
import { getPermissionStatus, scheduleConflictAlert } from '@/lib/notifications/scheduler'
import { isoWeekKey } from '@/lib/skin/week'

/**
 * Présente une alerte conflit locale si toutes les conditions sont réunies :
 *   1. notifications activées (toggle maître) ET alertes conflits activées,
 *   2. permission accordée,
 *   3. pas déjà notifié pour ce couple de produits cette semaine ISO (dédup).
 * Best-effort : aucun throw ne remonte au moteur de conflits.
 */
export async function notifyConflictDetected(
  productA: string,
  productB: string,
  notifPrefs: NotificationPrefs,
): Promise<void> {
  try {
    if (!notifPrefs.enabled || !notifPrefs.conflictAlerts) return

    const status = await getPermissionStatus()
    if (status !== 'granted') return

    const weekKey = isoWeekKey()
    const dedupKey = conflictDedupKey(productA, productB, weekKey)
    const title = 'Conseil routine'
    const body = `${productA} et ${productB} peuvent etre irritants ensemble. Ouvre ta routine pour voir le conseil.`

    await scheduleConflictAlert(title, body, dedupKey)
  } catch {
    // best-effort : le moteur de conflits ne doit jamais être impacté.
  }
}
