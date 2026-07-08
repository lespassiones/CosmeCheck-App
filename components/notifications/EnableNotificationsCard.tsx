/**
 * EnableNotificationsCard — carte d'opt-in "Rappels utiles", rendue par l'écran
 * de fin de bilan peau (voir shouldShowEnableCard dans lib/notifications/prefs).
 *
 * JAMAIS montée au lancement de l'app : l'opt-in se fait après le premier bilan,
 * moment où l'utilisateur comprend la valeur du rappel hebdo.
 *
 * "Activer" : prompt permission natif ; si accordé, active les notifications
 * (merge non destructif dans preferences.notifications) et programme le rappel
 * hebdo. En cas de refus, on marque seulement promptSeen (on ne redemande pas).
 * "Plus tard" : marque promptSeen sans activer.
 */

import { type FC, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import { colors } from '@/constants/colors'
import { spacing, radius } from '@/constants/spacing'
import { fontFamilies, typography } from '@/constants/typography'
import { useProfile } from '@/hooks/useProfile'
import { WhiteCard } from '@/components/design/WhiteCard'
import { readNotificationPrefs } from '@/lib/notifications/prefs'
import { requestPermission } from '@/lib/notifications/scheduler'
import { registerPushToken } from '@/lib/notifications/pushToken'

interface Props {
  onDone?: () => void
}

export const EnableNotificationsCard: FC<Props> = ({ onDone }) => {
  const { profile, updateProfile } = useProfile()
  const [busy, setBusy] = useState(false)

  const currentPrefs = readNotificationPrefs(
    (profile?.preferences as Record<string, unknown> | null | undefined)?.notifications as
      | Record<string, unknown>
      | null
      | undefined,
  )

  const handleEnable = async () => {
    if (busy) return
    setBusy(true)
    try {
      const granted = await requestPermission()
      if (granted) {
        await updateProfile({
          notifications: { ...currentPrefs, enabled: true, promptSeen: true },
        })
        // Rappel hebdo = push distant : on enregistre le token de l'appareil.
        await registerPushToken()
      } else {
        await updateProfile({
          notifications: { ...currentPrefs, promptSeen: true },
        })
      }
    } catch {
      // best-effort : ne bloque jamais le flow de fin de bilan.
    } finally {
      setBusy(false)
      onDone?.()
    }
  }

  const handleLater = async () => {
    if (busy) return
    setBusy(true)
    try {
      await updateProfile({
        notifications: { ...currentPrefs, promptSeen: true },
      })
    } catch {
      // best-effort
    } finally {
      setBusy(false)
      onDone?.()
    }
  }

  return (
    <WhiteCard>
      <View style={styles.headerRow}>
        <Ionicons name="notifications-outline" size={22} color={colors.rose} />
        <Text style={styles.title}>Rappels utiles</Text>
      </View>
      <Text style={styles.body}>
        Recois un rappel chaque semaine pour ton bilan peau, et une alerte si des
        produits de ta routine se genent.
      </Text>
      <Pressable
        onPress={handleEnable}
        disabled={busy}
        style={({ pressed }) => [
          styles.primaryBtn,
          pressed && styles.primaryBtnPressed,
          busy && styles.btnDisabled,
        ]}
      >
        {busy ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.primaryLabel}>Activer les notifications</Text>
        )}
      </Pressable>
      <Pressable onPress={handleLater} disabled={busy} style={styles.laterBtn}>
        <Text style={styles.laterLabel}>Plus tard</Text>
      </Pressable>
    </WhiteCard>
  )
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  title: {
    ...typography.h4,
    color: colors.ink,
  },
  body: {
    ...typography.small,
    color: colors.inkMuted,
    marginBottom: spacing.base,
  },
  primaryBtn: {
    backgroundColor: colors.rose,
    borderRadius: radius.pill,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnPressed: {
    backgroundColor: colors.roseDeep,
  },
  btnDisabled: {
    opacity: 0.7,
  },
  primaryLabel: {
    ...typography.button,
    color: '#FFFFFF',
  },
  laterBtn: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  laterLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 14,
    color: colors.inkMuted,
  },
})
