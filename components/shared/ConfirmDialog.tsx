/**
 * ConfirmDialog — modal de confirmation universelle (actions destructives,
 * déconnexion, etc.). Backdrop pressable + carte neumorphique avec deux boutons.
 *
 * Props : { visible, title, message?, confirmLabel?, cancelLabel?,
 *           destructive?, onConfirm, onCancel }
 */

import { type FC } from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import * as Haptics from 'expo-haptics'

import { colors } from '@/constants/colors'
import { spacing, radius } from '@/constants/spacing'
import { typography } from '@/constants/typography'
import { NeuCard } from '@/components/design/NeuCard'

interface Props {
  visible: boolean
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export const ConfirmDialog: FC<Props> = ({
  visible,
  title,
  message,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  destructive = false,
  onConfirm,
  onCancel,
}) => {
  const handleConfirm = () => {
    if (destructive) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {})
    }
    onConfirm()
  }

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={styles.dialogWrap} onPress={(e) => e.stopPropagation()}>
          <NeuCard variant="raised" interactive={false} padding={spacing.xl} style={styles.dialog}>
            <Text style={styles.title}>{title}</Text>
            {message ? <Text style={styles.message}>{message}</Text> : null}

            <View style={styles.actions}>
              <Pressable
                style={[styles.btn, styles.cancelBtn]}
                onPress={onCancel}
                accessibilityRole="button"
              >
                <Text style={styles.cancelText}>{cancelLabel}</Text>
              </Pressable>
              <Pressable
                style={[styles.btn, destructive ? styles.destructiveBtn : styles.confirmBtn]}
                onPress={handleConfirm}
                accessibilityRole="button"
              >
                <Text style={styles.confirmText}>{confirmLabel}</Text>
              </Pressable>
            </View>
          </NeuCard>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing['2xl'],
  },
  dialogWrap: {
    width: '100%',
    maxWidth: 360,
  },
  dialog: {
    backgroundColor: colors.surface,
  },
  title: {
    ...typography.h4,
    color: colors.ink,
    marginBottom: spacing.sm,
  },
  message: {
    ...typography.body,
    color: colors.inkMuted,
    marginBottom: spacing.xl,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  btn: {
    flex: 1,
    height: 48,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtn: {
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: 'transparent',
  },
  cancelText: {
    ...typography.button,
    color: colors.inkMuted,
  },
  confirmBtn: {
    backgroundColor: colors.ink,
  },
  destructiveBtn: {
    backgroundColor: colors.error,
  },
  confirmText: {
    ...typography.button,
    color: '#FFFFFF',
  },
})
