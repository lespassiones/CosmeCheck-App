/**
 * Canaux de notification Android (no-op sur iOS / module absent).
 *
 * QUOI : les 3 canaux visibles dans les réglages Android, avec copies FR, et un
 * créateur idempotent `ensureChannels()`.
 *
 * POURQUOI : Android impose des canaux pour catégoriser les notifications (et
 * laisser l'utilisateur les couper individuellement). iOS n'a pas de canaux :
 * la fonction devient un no-op. Tout passe par la garde native paresseuse.
 */

import { Platform } from 'react-native'

import { getNotificationsModule } from '@/lib/notifications/native'

/** Identifiants de canaux (référencés par le scheduler). */
export const CHANNELS = {
  bilan: 'bilan-hebdo',
  conflits: 'conflits',
  suiviProduit: 'suivi-produit',
} as const

export type ChannelId = (typeof CHANNELS)[keyof typeof CHANNELS]

/**
 * Crée (ou met à jour) les 3 canaux Android. Idempotent : Android remplace le
 * canal existant du même id. No-op si iOS ou si le module natif est absent.
 */
export async function ensureChannels(): Promise<void> {
  if (Platform.OS !== 'android') return
  const Notifications = getNotificationsModule()
  if (!Notifications) return
  try {
    const importance = Notifications.AndroidImportance ?? {}
    await Notifications.setNotificationChannelAsync(CHANNELS.bilan, {
      name: 'Rappels de bilan peau',
      description: 'Un rappel par semaine pour faire ton bilan peau.',
      importance: importance.DEFAULT ?? 3,
    })
    await Notifications.setNotificationChannelAsync(CHANNELS.conflits, {
      name: 'Alertes routine',
      description: 'Previens-moi si des produits de ma routine se genent.',
      importance: importance.HIGH ?? 4,
    })
    await Notifications.setNotificationChannelAsync(CHANNELS.suiviProduit, {
      name: 'Suivi de tes produits',
      description: "Point d'etape sur un produit apres 14 jours d'utilisation.",
      importance: importance.DEFAULT ?? 3,
    })
  } catch {
    // best-effort : un échec de création de canal ne doit jamais crasher l'app.
  }
}
