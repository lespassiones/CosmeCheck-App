/**
 * SuggestionsChooserSheet — feuille (Modal bottom-sheet) ouverte par le bouton
 * « Suggestions ». Deux actions au choix :
 *   1. Réorganiser ma routine (IA, 1 crédit) : range chaque produit
 *      matin/soir dans le bon ordre. Rendu si reorganizeEnabled (flag).
 *   2. Proposer de meilleures alternatives (IA, deck existant) : rendu si
 *      alternativesEnabled (flag_suggestions).
 *
 * Le choix « alternatives » appelle le pipeline deck EXISTANT (openSuggestions)
 * sans y toucher.
 */

import { memo } from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'

import { colors } from '@/constants/colors'
import { spacing, radius } from '@/constants/spacing'
import { fontFamilies } from '@/constants/typography'

interface Props {
  visible: boolean
  onClose: () => void
  reorganizeEnabled: boolean
  alternativesEnabled: boolean
  alternativesLoading: boolean
  onReorganize: () => void
  onAlternatives: () => void
}

export const SuggestionsChooserSheet = memo(function SuggestionsChooserSheet({
  visible,
  onClose,
  reorganizeEnabled,
  alternativesEnabled,
  alternativesLoading,
  onReorganize,
  onAlternatives,
}: Props) {
  const insets = useSafeAreaInsets()

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>Suggestions</Text>
          <Text style={styles.subtitle}>Comment veux-tu améliorer ta routine ?</Text>

          {reorganizeEnabled && (
            <Pressable
              style={styles.option}
              onPress={() => {
                onClose()
                onReorganize()
              }}
              accessibilityRole="button"
            >
              <View style={[styles.iconWrap, { backgroundColor: colors.accentSoft }]}>
                <Ionicons name="swap-vertical" size={20} color={colors.accent} />
              </View>
              <View style={styles.optionMain}>
                <Text style={styles.optionTitle}>Réorganiser ma routine</Text>
                <Text style={styles.optionText}>
                  Notre IA place chaque soin au bon moment (matin ou soir) selon tes produits et
                  ton profil. 1 crédit.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.inkLight} />
            </Pressable>
          )}

          {alternativesEnabled && (
            <Pressable
              style={[styles.option, alternativesLoading && styles.optionDisabled]}
              disabled={alternativesLoading}
              onPress={() => {
                onClose()
                onAlternatives()
              }}
              accessibilityRole="button"
            >
              <View style={[styles.iconWrap, { backgroundColor: colors.roseSoft }]}>
                <Ionicons name="sparkles" size={20} color={colors.rose} />
              </View>
              <View style={styles.optionMain}>
                <Text style={styles.optionTitle}>Proposer de meilleures alternatives</Text>
                <Text style={styles.optionText}>
                  Des produits plus propres pour remplacer ceux à surveiller, adaptés à ton profil.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.inkLight} />
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  )
})

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15,23,42,0.45)',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.gray300,
    marginBottom: spacing.sm,
  },
  title: {
    fontFamily: fontFamilies.bold,
    fontSize: 17,
    color: colors.ink,
  },
  subtitle: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    color: colors.inkMuted,
    marginTop: 2,
    marginBottom: spacing.md,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.lg,
  },
  optionDisabled: {
    opacity: 0.5,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionMain: { flex: 1 },
  optionTitle: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 14,
    color: colors.ink,
  },
  optionText: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    color: colors.inkMuted,
    marginTop: 2,
    lineHeight: 17,
  },
})
