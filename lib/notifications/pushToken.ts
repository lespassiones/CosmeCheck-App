/**
 * Enregistrement du token push Expo (notifications DISTANTES personnalisées).
 *
 * QUOI : récupère le token Expo Push de l'appareil (`getExpoPushTokenAsync`) et
 * l'upsert en base via la RPC `cosme_check_register_push_token`, pour que le
 * cron serveur (Edge `send-weekly-bilan`) puisse pousser le rappel de bilan
 * même app fermée.
 *
 * POURQUOI un module à part : garder l'accès natif paresseux (native.ts) et
 * ne rien importer d'`expo-notifications` au top-level. No-op si le module natif
 * est absent (OTA pré-rebuild) ou si la permission n'est pas accordée.
 *
 * Le `projectId` EAS est requis par getExpoPushTokenAsync sur un build standalone
 * (il est lu depuis app.json via expo-constants).
 */

import { Platform } from 'react-native'

import { supabase } from '@/lib/supabase/client'
import { getNotificationsModule } from '@/lib/notifications/native'

/** Récupère le projectId EAS (app.json extra.eas.projectId) pour Expo Push. */
function getEasProjectId(): string | undefined {
  try {
    // Import différé : evite un import top-level inutile côté tests node.
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const Constants = require('expo-constants').default
    return (
      Constants?.expoConfig?.extra?.eas?.projectId ??
      Constants?.easConfig?.projectId ??
      undefined
    )
  } catch {
    return undefined
  }
}

/**
 * Enregistre (ou rafraîchit) le token push de cet appareil pour l'utilisateur
 * courant. Best-effort : toute erreur est avalée (jamais bloquant au boot).
 * À appeler quand les notifications sont activées ET la permission accordée.
 */
export async function registerPushToken(): Promise<void> {
  const Notifications = getNotificationsModule()
  if (!Notifications) return // module natif absent : no-op (pré-rebuild)

  try {
    const projectId = getEasProjectId()
    const res = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    )
    const token: string | undefined = res?.data
    if (!token || token.length < 10) return

    await supabase.rpc('cosme_check_register_push_token', {
      p_token: token,
      p_platform: Platform.OS,
    })
  } catch {
    // Réseau / permission / module : best-effort, on réessaiera au prochain boot.
  }
}
