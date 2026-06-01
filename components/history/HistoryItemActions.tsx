/**
 * HistoryItemActions — feuille d'actions (bottom sheet) pour une ligne
 * d'historique. Twin RN de components/history/HistoryItemActions.tsx (web).
 *
 * Déclenchée par un bouton kebab (•••) sur chaque carte. Ouvre une Modal
 * néomorphique remontant du bas avec deux actions :
 *  - Renommer : champ inline (update analyses.name)
 *  - Supprimer : confirmation puis delete analyses
 *
 * Les mutations passent par les callbacks fournis par le parent (qui gère
 * l'optimistic update + invalidation react-query). Ce composant ne fait que
 * l'UI + la collecte du nouveau nom.
 */

import { type FC, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'

import { colors } from '@/constants/colors'
import { radius, spacing } from '@/constants/spacing'
import { fontFamilies, typography } from '@/constants/typography'

interface Props {
  visible: boolean
  currentName: string
  onClose: () => void
  /** Renomme l'analyse. Doit résoudre quand l'update serveur est terminé. */
  onRename: (newName: string) => Promise<void>
  /** Supprime l'analyse. */
  onDelete: () => Promise<void>
}

export const HistoryItemActions: FC<Props> = ({
  visible,
  currentName,
  onClose,
  onRename,
  onDelete,
}) => {
  const insets = useSafeAreaInsets()
  const [editing, setEditing] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [name, setName] = useState(currentName)
  const [pending, setPending] = useState(false)

  // Réinitialise l'état interne à chaque (ré)ouverture.
  useEffect(() => {
    if (visible) {
      setEditing(false)
      setConfirmingDelete(false)
      setName(currentName)
      setPending(false)
    }
  }, [visible, currentName])

  const close = () => {
    if (pending) return
    onClose()
  }

  const save = async () => {
    const newName = name.trim()
    if (!newName || newName === currentName) {
      setEditing(false)
      return
    }
    setPending(true)
    try {
      await onRename(newName)
      onClose()
    } catch {
      // Échec silencieux : on garde la feuille ouverte pour réessayer.
      setPending(false)
    }
  }

  const remove = async () => {
    setPending(true)
    try {
      await onDelete()
      onClose()
    } catch {
      setPending(false)
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={close}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={close} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.grabber} />

        {editing ? (
          <View style={styles.editWrap}>
            <Text style={styles.editLabel}>Nouveau nom</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              autoFocus
              maxLength={200}
              placeholder="Nom de l'analyse"
              placeholderTextColor={colors.inkLight}
              selectionColor={colors.rose}
              style={styles.input}
              returnKeyType="done"
              onSubmitEditing={() => void save()}
              editable={!pending}
            />
            <View style={styles.editActions}>
              <Pressable
                style={[styles.btn, styles.btnGhost]}
                onPress={() => setEditing(false)}
                disabled={pending}
              >
                <Text style={styles.btnGhostText}>Annuler</Text>
              </Pressable>
              <Pressable
                style={[styles.btn, styles.btnPrimary, pending && styles.btnDisabled]}
                onPress={() => void save()}
                disabled={pending}
              >
                {pending ? (
                  <ActivityIndicator color={colors.surface} size="small" />
                ) : (
                  <Text style={styles.btnPrimaryText}>Enregistrer</Text>
                )}
              </Pressable>
            </View>
          </View>
        ) : confirmingDelete ? (
          <View style={styles.editWrap}>
            <Text style={styles.confirmTitle}>Supprimer cette analyse ?</Text>
            <Text style={styles.confirmText}>
              Cette action est définitive et ne peut pas être annulée.
            </Text>
            <View style={styles.editActions}>
              <Pressable
                style={[styles.btn, styles.btnGhost]}
                onPress={() => setConfirmingDelete(false)}
                disabled={pending}
              >
                <Text style={styles.btnGhostText}>Annuler</Text>
              </Pressable>
              <Pressable
                style={[styles.btn, styles.btnDanger, pending && styles.btnDisabled]}
                onPress={() => void remove()}
                disabled={pending}
              >
                {pending ? (
                  <ActivityIndicator color={colors.surface} size="small" />
                ) : (
                  <Text style={styles.btnPrimaryText}>Supprimer</Text>
                )}
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.menu}>
            <Text style={styles.menuTitle} numberOfLines={1}>
              {currentName}
            </Text>
            <Pressable
              style={styles.menuItem}
              onPress={() => setEditing(true)}
              accessibilityRole="button"
            >
              <Ionicons name="create-outline" size={20} color={colors.ink} />
              <Text style={styles.menuItemText}>Renommer</Text>
            </Pressable>
            <Pressable
              style={styles.menuItem}
              onPress={() => setConfirmingDelete(true)}
              accessibilityRole="button"
            >
              <Ionicons name="trash-outline" size={20} color={colors.error} />
              <Text style={[styles.menuItemText, { color: colors.error }]}>Supprimer</Text>
            </Pressable>
          </View>
        )}
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.neu.bg,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.gray300,
    marginBottom: spacing.base,
  },
  menu: { gap: spacing.xs },
  menuTitle: {
    ...typography.xsMedium,
    color: colors.inkMuted,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.md,
  },
  menuItemText: { ...typography.bodyMedium, color: colors.ink },
  editWrap: { gap: spacing.sm },
  editLabel: { ...typography.xsMedium, color: colors.inkMuted },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    fontFamily: fontFamilies.regular,
    fontSize: 16,
    color: colors.ink,
  },
  confirmTitle: { ...typography.h4, color: colors.ink },
  confirmText: { ...typography.small, color: colors.inkMuted },
  editActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  btn: {
    flex: 1,
    height: 48,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnGhost: { backgroundColor: colors.gray100 },
  btnGhostText: { ...typography.buttonSmall, color: colors.inkMuted },
  btnPrimary: { backgroundColor: colors.rose },
  btnPrimaryText: { ...typography.buttonSmall, color: colors.surface },
  btnDanger: { backgroundColor: colors.error },
  btnDisabled: { opacity: 0.6 },
})
