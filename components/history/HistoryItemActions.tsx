/**
 * HistoryItemActions — feuille d'actions (bottom sheet) pour une ligne
 * d'historique. Twin RN de components/history/HistoryItemActions.tsx (web).
 *
 * Déclenchée par un bouton kebab (•••) sur chaque carte. Ouvre une Modal
 * remontant du bas : cartes blanches groupées (icône + libellé + chevron),
 * l'action destructive isolée dans sa propre carte.
 *  - Favoris : bascule le statut favori
 *  - Renommer : champ inline (update analyses.name)
 *  - Supprimer : confirmation puis delete analyses
 *
 * Les mutations passent par les callbacks fournis par le parent (qui gère
 * l'optimistic update + invalidation react-query). Ce composant ne fait que
 * l'UI + la collecte du nouveau nom.
 *
 * CLAVIER (bug bêta Stela, 12 sept 2026 : « Renommer ne marche pas »).
 * La feuille est en `position: absolute; bottom: 0` DANS une `Modal`. Sur
 * Android, `app.json` est en `softwareKeyboardLayoutMode: "pan"` et une Modal RN
 * ouvre sa PROPRE fenêtre : ni le pan ni un `KeyboardAvoidingView` ne la
 * remontent de façon fiable. Le champ et le bouton « Enregistrer » restaient
 * donc SOUS le clavier, invisibles et hors d'atteinte. On mesure nous-mêmes la
 * hauteur du clavier (événements `Keyboard`) et on la reporte en marge basse :
 * ça marche sur les deux plateformes quel que soit le mode de la fenêtre.
 */

import { type FC, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Keyboard,
  Modal,
  Platform,
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
import { HapticPressable as Pressable } from '@/components/shared/HapticPressable'
import type { HapticLevel } from '@/lib/pressFeedback'

interface Props {
  visible: boolean
  currentName: string
  favori: boolean
  onClose: () => void
  /** Renomme l'analyse. Doit résoudre quand l'update serveur est terminé. */
  onRename: (newName: string) => Promise<void>
  /** Supprime l'analyse. */
  onDelete: () => Promise<void>
  /** Bascule le statut favori. */
  onToggleFavori: () => void
}

export const HistoryItemActions: FC<Props> = ({
  visible,
  currentName,
  favori,
  onClose,
  onRename,
  onDelete,
  onToggleFavori,
}) => {
  const insets = useSafeAreaInsets()
  const [editing, setEditing] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [name, setName] = useState(currentName)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [keyboardHeight, setKeyboardHeight] = useState(0)

  // Réinitialise l'état interne à chaque (ré)OUVERTURE seulement. La dépendance
  // sur `currentName` refermait le mode édition si le parent rafraîchissait le
  // libellé pendant la saisie (optimistic update / refetch de la liste).
  const wasVisible = useRef(false)
  useEffect(() => {
    if (visible && !wasVisible.current) {
      setEditing(false)
      setConfirmingDelete(false)
      setName(currentName)
      setPending(false)
      setError(null)
    }
    wasVisible.current = visible
  }, [visible, currentName])

  // Hauteur réelle du clavier -> marge basse de la feuille (cf. note en tête).
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
    const onShow = Keyboard.addListener(showEvt, (e) =>
      setKeyboardHeight(e.endCoordinates?.height ?? 0),
    )
    const onHide = Keyboard.addListener(hideEvt, () => setKeyboardHeight(0))
    return () => {
      onShow.remove()
      onHide.remove()
    }
  }, [])

  // Le clavier se referme avec la feuille (sinon il reste ouvert sur l'écran).
  useEffect(() => {
    if (!visible) {
      Keyboard.dismiss()
      setKeyboardHeight(0)
    }
  }, [visible])

  const close = () => {
    if (pending) return
    onClose()
  }

  const save = async () => {
    const newName = name.trim()
    if (!newName) {
      setError('Donne un nom au produit.')
      return
    }
    if (newName === currentName) {
      setEditing(false)
      return
    }
    setPending(true)
    setError(null)
    try {
      await onRename(newName)
      onClose()
    } catch {
      // L'échec doit être VU : un toast du parent se rend derrière la Modal sur
      // Android (fenêtre séparée), donc on affiche l'erreur dans la feuille.
      setError('Renommage impossible. Vérifie ta connexion et réessaie.')
      setPending(false)
    }
  }

  const remove = async () => {
    setPending(true)
    setError(null)
    try {
      await onDelete()
      onClose()
    } catch {
      setError('Suppression impossible. Vérifie ta connexion et réessaie.')
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
      <Pressable style={styles.backdrop} onPress={close} haptic="none" pressScale={false} />
      <View
        style={[
          styles.sheet,
          { paddingBottom: Math.max(insets.bottom, keyboardHeight) + spacing.lg },
        ]}
      >
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
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
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
                haptic="success"
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
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
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
                haptic="warning"
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
            {/* Actions courantes, groupées dans une carte (filet entre les lignes). */}
            <View style={styles.menuGroup}>
              <MenuRow
                icon={favori ? 'bookmark' : 'bookmark-outline'}
                label={favori ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                tint={favori ? colors.rose : colors.ink}
                haptic="selection"
                onPress={() => { onToggleFavori(); onClose() }}
              />
              <MenuRow
                icon="create-outline"
                label="Renommer"
                tint={colors.ink}
                divider
                onPress={() => setEditing(true)}
              />
            </View>
            {/* Action destructive, isolée dans sa propre carte. */}
            <View style={styles.menuGroup}>
              <MenuRow
                icon="trash-outline"
                label="Supprimer"
                tint={colors.error}
                onPress={() => setConfirmingDelete(true)}
              />
            </View>
          </View>
        )}
      </View>
    </Modal>
  )
}

/** Ligne du menu : icône + libellé + chevron, fond gris léger à l'appui. */
const MenuRow: FC<{
  icon: keyof typeof Ionicons.glyphMap
  label: string
  tint: string
  divider?: boolean
  haptic?: HapticLevel
  onPress: () => void
}> = ({ icon, label, tint, divider = false, haptic, onPress }) => (
  <Pressable
    onPress={onPress}
    haptic={haptic}
    accessibilityRole="button"
    accessibilityLabel={label}
    style={({ pressed }) => [
      styles.menuItem,
      divider && styles.menuItemDivider,
      pressed && styles.menuItemPressed,
    ]}
  >
    <Ionicons name={icon} size={24} color={tint} />
    <Text style={[styles.menuItemText, { color: tint }]}>{label}</Text>
    <Ionicons name="chevron-forward" size={20} color={colors.inkLight} />
  </Pressable>
)

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bg,
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
  menu: { gap: spacing.base },
  menuTitle: {
    ...typography.xsMedium,
    color: colors.inkMuted,
    marginBottom: -spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  menuGroup: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.base,
    paddingVertical: spacing.base,
    paddingHorizontal: spacing.base,
  },
  menuItemDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  menuItemPressed: { backgroundColor: colors.gray50 },
  menuItemText: { flex: 1, fontFamily: fontFamilies.regular, fontSize: 16, color: colors.ink },
  editWrap: { gap: spacing.sm },
  editLabel: { ...typography.xsMedium, color: colors.inkMuted },
  errorText: { ...typography.small, color: colors.error },
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
  btnPrimary: { backgroundColor: colors.success },
  btnPrimaryText: { ...typography.buttonSmall, color: colors.surface },
  btnDanger: { backgroundColor: colors.error },
  btnDisabled: { opacity: 0.6 },
})
