/**
 * ProcessingOverlay — overlay plein écran (Modal transparent) pour les
 * opérations longues. Backdrop sombre + carte glassmorphique centrée avec
 * spinner et message.
 *
 * Props : { visible, message? }
 */

import { type FC } from 'react'
import { ActivityIndicator, Modal, StyleSheet, Text, View } from 'react-native'
import { BlurView } from 'expo-blur'

import { colors } from '@/constants/colors'
import { spacing, radius } from '@/constants/spacing'
import { typography } from '@/constants/typography'

interface Props {
  visible: boolean
  message?: string
}

export const ProcessingOverlay: FC<Props> = ({ visible, message = 'Analyse en cours…' }) => {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <BlurView intensity={24} tint="light" style={StyleSheet.absoluteFill} />
          <View style={styles.cardInner}>
            <ActivityIndicator size="large" color={colors.rose} />
            <Text style={styles.message}>{message}</Text>
            <Text style={styles.note}>Ne ferme pas l’application…</Text>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    width: 280,
    borderRadius: radius.card,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.glass.border,
    backgroundColor: colors.glass.bgStrong,
  },
  cardInner: {
    paddingVertical: spacing['2xl'],
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
  },
  message: {
    ...typography.h4,
    color: colors.ink,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  note: {
    ...typography.xs,
    color: colors.inkMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
})
