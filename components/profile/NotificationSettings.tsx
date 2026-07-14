/**
 * NotificationSettings — section "Notifications" du profil.
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

import { type FC, useCallback, useEffect, useState } from 'react'
import { Linking, StyleSheet, Switch, Text, View } from 'react-native'

import { colors } from '@/constants/colors'
import { spacing, radius } from '@/constants/spacing'
import { fontFamilies, typography } from '@/constants/typography'
import { useProfile } from '@/hooks/useProfile'
import { NeuCard } from '@/components/design/NeuCard'
import { readNotificationPrefs } from '@/lib/notifications/prefs'
import {
  cancelByChannel,
  getPermissionStatus,
  requestPermission,
  type PermissionStatus,
} from '@/lib/notifications/scheduler'
import { registerPushToken } from '@/lib/notifications/pushToken'
import { setNewsletterConsent } from '@/lib/newsletter/subscribe'

export const NotificationSettings: FC = () => {
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

  return (
    <NeuCard>
      <Text style={styles.sectionTitle}>Notifications</Text>

      <View style={styles.row}>
        <Text style={styles.rowLabel}>Notifications</Text>
        <Switch
          value={prefs.enabled && available}
          onValueChange={handleMasterToggle}
          disabled={busy || !available}
          trackColor={{ true: colors.rose, false: colors.gray300 }}
          thumbColor="#FFFFFF"
        />
      </View>

      {!available ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            Disponible apres la prochaine mise a jour de l'application.
          </Text>
        </View>
      ) : null}

      {available && prefs.enabled && status === 'denied' ? (
        <Text
          style={styles.settingsLink}
          onPress={() => {
            void Linking.openSettings()
          }}
        >
          Autoriser dans les reglages
        </Text>
      ) : null}
    </NeuCard>
  )
}

const styles = StyleSheet.create({
  sectionTitle: {
    ...typography.h4,
    color: colors.ink,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  rowLabel: {
    ...typography.bodyMedium,
    color: colors.ink,
  },
  banner: {
    marginTop: spacing.sm,
    backgroundColor: colors.infoSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  bannerText: {
    ...typography.xs,
    color: colors.info,
  },
  settingsLink: {
    ...typography.smallMedium,
    color: colors.rose,
    marginTop: spacing.sm,
  },
})
