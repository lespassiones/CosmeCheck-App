/**
 * NotificationSettings — section "Notifications" du profil.
 *
 * Toggle maître + ligne "Suivi produit" (J+14, phase 2). Gère les états
 * dégradés :
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

  const handleSuiviToggle = useCallback(
    async (next: boolean) => {
      if (busy || !available || !prefs.enabled) return
      setBusy(true)
      try {
        // Phase 2 : la préférence est stockée, aucune programmation (stub).
        await updateProfile({ notifications: { ...prefs, suiviProduit: next } })
      } catch {
        // best-effort
      } finally {
        setBusy(false)
      }
    },
    [busy, available, prefs, updateProfile],
  )

  const rowsDisabled = !prefs.enabled || !available

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

      <View style={styles.divider} />

      <View style={[styles.row, rowsDisabled && styles.rowDisabled]}>
        <View style={styles.rowLabelWrap}>
          <Text style={styles.rowLabel}>Suivi produit</Text>
          <Text style={styles.rowSub}>Tous les 14 jours</Text>
        </View>
        <Switch
          value={prefs.suiviProduit && prefs.enabled && available}
          onValueChange={handleSuiviToggle}
          disabled={rowsDisabled || busy}
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
  rowDisabled: {
    opacity: 0.45,
  },
  rowLabelWrap: {
    flex: 1,
  },
  rowLabel: {
    ...typography.bodyMedium,
    color: colors.ink,
  },
  rowSub: {
    ...typography.xs,
    color: colors.inkMuted,
    marginTop: 2,
  },
  rowValue: {
    ...typography.small,
    color: colors.inkMuted,
  },
  divider: {
    height: 1,
    backgroundColor: colors.neu.shadowDark,
    opacity: 0.5,
    marginVertical: spacing.xs,
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
