/**
 * Rappel de fin d'essai gratuit : une notification locale la veille du premier
 * prélèvement.
 *
 * Le paywall de fin d'onboarding promet « On te rappelle que l'essai se
 * termine » : cette promesse n'est affichée QUE si les notifications sont
 * autorisées, et c'est ce module qui la tient. Best-effort : aucun échec ne
 * remonte à l'achat.
 */

import { getNotificationsModule } from '@/lib/notifications/native'

/** Délai avant le rappel : la veille de la fin de l'essai, au minimum 12 h. */
export function trialReminderDelayMs(trialDays: number): number | null {
  if (!Number.isFinite(trialDays) || trialDays < 2) return null
  return (trialDays - 1) * 24 * 60 * 60 * 1000
}

export async function scheduleTrialReminder(trialDays: number, now = Date.now()): Promise<boolean> {
  const delay = trialReminderDelayMs(trialDays)
  if (delay === null) return false
  const Notifications = getNotificationsModule()
  if (!Notifications) return false
  try {
    const trigger = Notifications.SchedulableTriggerInputTypes?.DATE
      ? { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(now + delay) }
      : { date: new Date(now + delay) }
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Ton essai Premium se termine demain',
        body: "Tu peux l'annuler en quelques gestes depuis ton compte, ou continuer à profiter de tout.",
        data: { url: '/offre' },
      },
      trigger,
    })
    return true
  } catch {
    return false
  }
}
