/**
 * ConfirmDialog : modal de confirmation universelle (actions destructives,
 * déconnexion, etc.). Backdrop pressable + carte blanche (WhiteCard, arrondi
 * `radius.pill`, ombre douce) avec deux boutons pilule : « Annuler » en contour,
 * action en encre foncée (neutre) ou en rouge (`destructive`).
 *
 * Props : { visible, title, message?, confirmLabel?, cancelLabel?,
 *           destructive?, centered?, loading?, loadingLabel?, onConfirm, onCancel }
 *
 * `loading` (ex. suppression du compte en cours) : roue de chargement dans le
 * bouton d'action avec `loadingLabel`, boutons désactivés, et la fenêtre ne se
 * ferme plus (ni par le fond, ni par le retour Android) tant que l'action tourne.
 */

import { type FC } from 'react'
import { ActivityIndicator, Modal, StyleSheet, Text, View } from 'react-native'

import { HapticPressable as Pressable } from '@/components/shared/HapticPressable'

import { colors } from '@/constants/colors'
import { spacing, radius } from '@/constants/spacing'
import { fontFamilies, typography } from '@/constants/typography'
import { WhiteCard } from '@/components/design/WhiteCard'

interface Props {
  visible: boolean
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  /** Titre et message centrés, titre en gras, « Annuler » en encre foncée. */
  centered?: boolean
  /** Action en cours : roue dans le bouton d'action, fenêtre verrouillée. */
  loading?: boolean
  /** Libellé du bouton d'action pendant `loading` (défaut : `confirmLabel`). */
  loadingLabel?: string
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
  centered = false,
  loading = false,
  loadingLabel,
  onConfirm,
  onCancel,
}) => {
  const handleConfirm = () => {
    if (loading) return
    onConfirm()
  }
  // Pendant l'action, aucune porte de sortie : fermer la fenêtre ferait croire
  // que l'action est annulée alors qu'elle continue côté serveur.
  const handleCancel = () => {
    if (!loading) onCancel()
  }

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={handleCancel}>
      <Pressable style={styles.backdrop} onPress={handleCancel} haptic="none" pressScale={false}>
        <Pressable
          style={styles.dialogWrap}
          onPress={(e) => e.stopPropagation()}
          haptic="none"
          pressScale={false}
        >
          <WhiteCard padding={spacing.xl} borderRadius={radius.pill}>
            <Text style={[styles.title, centered && styles.titleCentered]}>{title}</Text>
            {message ? (
              <Text style={[styles.message, centered && styles.messageCentered]}>{message}</Text>
            ) : null}

            <View style={styles.actions}>
              <Pressable
                style={({ pressed }) => [
                  styles.btn,
                  styles.cancelBtn,
                  pressed && !loading && styles.pressed,
                  loading && styles.dimmed,
                ]}
                onPress={handleCancel}
                disabled={loading}
                accessibilityRole="button"
                accessibilityState={{ disabled: loading }}
              >
                <Text style={[styles.cancelText, centered && styles.cancelTextStrong]}>
                  {cancelLabel}
                </Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.btn,
                  destructive ? styles.destructiveBtn : styles.confirmBtn,
                  pressed && !loading && styles.pressed,
                  loading && styles.busy,
                ]}
                onPress={handleConfirm}
                haptic={destructive ? 'warning' : 'primary'}
                disabled={loading}
                accessibilityRole="button"
                accessibilityState={{ disabled: loading, busy: loading }}
              >
                {loading ? (
                  <View style={styles.loadingRow}>
                    <ActivityIndicator size="small" color={colors.surface} />
                    <Text style={styles.confirmText} numberOfLines={1}>
                      {loadingLabel ?? confirmLabel}
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.confirmText} numberOfLines={1}>
                    {confirmLabel}
                  </Text>
                )}
              </Pressable>
            </View>
          </WhiteCard>
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
  title: {
    ...typography.h4,
    color: colors.ink,
    marginBottom: spacing.sm,
  },
  titleCentered: {
    fontFamily: fontFamilies.bold,
    textAlign: 'center',
  },
  message: {
    ...typography.body,
    color: colors.inkMuted,
    marginBottom: spacing.xl,
  },
  messageCentered: {
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  btn: {
    flex: 1,
    minHeight: 48,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtn: {
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  cancelText: {
    ...typography.button,
    color: colors.inkMuted,
    textAlign: 'center',
  },
  cancelTextStrong: {
    color: colors.ink,
  },
  confirmBtn: {
    backgroundColor: colors.ink,
  },
  destructiveBtn: {
    backgroundColor: colors.error,
  },
  confirmText: {
    ...typography.button,
    color: colors.surface,
    textAlign: 'center',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  pressed: {
    opacity: 0.85,
  },
  // Action en cours : le bouton reste lisible mais adouci (cf. maquette).
  busy: {
    opacity: 0.8,
  },
  dimmed: {
    opacity: 0.5,
  },
})
