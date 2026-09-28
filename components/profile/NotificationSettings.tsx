/**
 * useNotificationToggle — logique de l'interrupteur « Notifications » du
 * profil (28/09/2026 : l'affichage est une ligne de ProfileScreen, ce module ne
 * garde que la logique).
 *
 * Toggle maître unique. (La ligne "Suivi produit" J+14 a été retirée : la
 * fonctionnalité n'a jamais été construite, un toggle mort fait désordre ;
 * à réintroduire via un scénario du planner serveur le jour venu.)
 * Gère les états dégradés :
 *   - module natif absent (OTA pré-rebuild) -> bandeau "Disponible apres la
 *     prochaine mise a jour de l'application", contrôles inertes ;
 *   - permission refusée alors que le toggle est ON -> lien vers les réglages
 *     système (Linking.openSettings).
 *
 * Le toggle écrit dans preferences.notifications (merge non destructif) et
 * enregistre le token push (alertes de routine).
 */

import { useCallback, useEffect, useState } from 'react'
import { Linking } from 'react-native'

import { useProfile } from '@/hooks/useProfile'
import { readNotificationPrefs } from '@/lib/notifications/prefs'
import {
  cancelByChannel,
  getPermissionStatus,
  requestPermission,
  type PermissionStatus,
} from '@/lib/notifications/scheduler'
import { registerPushToken } from '@/lib/notifications/pushToken'
import { setNewsletterConsent } from '@/lib/newsletter/subscribe'

export function useNotificationToggle() {
  const { profile, updateProfile } = useProfile()
  const [status, setStatus] = useState<PermissionStatus>('undetermined')
  const [busy, setBusy] = useState(false)

  const prefs = readNotificationPrefs(
    (profile?.preferences as Record<string, unknown> | null | undefined)?.notifications as
      | Record<string, unknown>
      | null
      | undefined,
  )

  useEffect(() => {
    let alive = true
    void (async () => {
      const s = await getPermissionStatus()
      if (alive) setStatus(s)
    })()
    return () => {
      alive = false
    }
  }, [])

  const available = status !== 'unavailable'

  const handleMasterToggle = useCallback(
    async (next: boolean) => {
      if (busy || !available) return
      setBusy(true)
      try {
        if (next) {
          const granted = await requestPermission()
          const s = await getPermissionStatus()
          setStatus(s)
          if (granted) {
            await updateProfile({ notifications: { ...prefs, enabled: true, promptSeen: true } })
            // Rappel hebdo = push distant : enregistrer le token de l'appareil.
            await registerPushToken()
          } else {
            // Refus système : on active le préférence côté app mais on montre le
            // lien vers les réglages (rien n'est programmé tant que refusé).
            await updateProfile({ notifications: { ...prefs, enabled: true, promptSeen: true } })
          }
          // Couplage assumé : activer les notifications inscrit aussi à la
          // newsletter Brevo (#5). Best-effort (non bloquant).
          void setNewsletterConsent(true, 'settings_notifications')
        } else {
          await updateProfile({ notifications: { ...prefs, enabled: false } })
          await cancelByChannel('bilan-hebdo')
          await cancelByChannel('suivi-')
        }
      } catch {
        // best-effort
      } finally {
        setBusy(false)
      }
    },
    [busy, available, prefs, updateProfile],
  )

  return {
    /** Interrupteur affiché : préférence activée ET module natif présent. */
    enabled: prefs.enabled && available,
    /** Module natif présent (sinon : build OTA antérieure, contrôle inerte). */
    available,
    busy,
    /** Préférence ON mais permission système refusée : proposer les réglages. */
    deniedBySystem: available && prefs.enabled && status === 'denied',
    toggle: handleMasterToggle,
    openSystemSettings: () => {
      void Linking.openSettings()
    },
  }
}
