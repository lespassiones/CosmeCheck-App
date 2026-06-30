/**
 * MaintenanceGate — overlay plein écran bloquant affiché quand l'admin active
 * le mode maintenance (Paramètres → mode maintenance). Monté au niveau racine
 * (dans les providers, a besoin du QueryClient via useAppConfig).
 *
 * FAIL-OPEN : useAppConfig renvoie maintenance_mode=false par défaut si la RPC
 * échoue → jamais d'écran de maintenance affiché par erreur sur un blip réseau.
 *
 * Non dismissable : pas de bouton de fermeture. Le polling 30 s de useAppConfig
 * le retire automatiquement dès que l'admin repasse maintenance OFF.
 */

import type { FC } from 'react'
import { Modal, StyleSheet, Text, View } from 'react-native'

import { colors } from '@/constants/colors'
import { radius, spacing } from '@/constants/spacing'
import { fontFamilies, typography } from '@/constants/typography'
import { useAppConfig } from '@/hooks/useAppConfig'

const DEFAULT_MESSAGE =
  'Cosme Check est momentanément en maintenance. On revient très vite, merci de ta patience.'

export const MaintenanceGate: FC = () => {
  const { config } = useAppConfig()

  if (!config.maintenance_mode) return null

  const message =
    config.maintenance_message && config.maintenance_message.trim().length > 0
      ? config.maintenance_message
      : DEFAULT_MESSAGE

  return (
    <Modal visible transparent={false} animationType="fade" statusBarTranslucent>
      <View style={styles.screen}>
        <View style={styles.card}>
          <Text style={styles.emoji}>🛠️</Text>
          <Text style={styles.title}>Maintenance en cours</Text>
          <Text style={styles.message}>{message}</Text>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.xl,
  },
  emoji: { fontSize: 40, marginBottom: spacing.md },
  title: {
    ...typography.h3,
    color: colors.ink,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  message: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 21,
    color: colors.inkMuted,
    textAlign: 'center',
  },
})
