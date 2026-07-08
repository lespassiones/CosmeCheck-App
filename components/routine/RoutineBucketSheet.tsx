/**
 * RoutineBucketSheet — feuille de choix du bucket au moment d'ajouter un produit
 * à la routine (« Ma routine soin » vs « Produits du quotidien »).
 *
 * Ouverte depuis le bouton « Ajouter à ma routine » de l'écran d'analyse. Le
 * choix est EXPLICITE (les deux buckets ne suivent pas la même logique). Une
 * suggestion (via classifyProductKind) pré-signale le bucket probable sans
 * l'imposer. Un texte en italique explique la différence des deux blocs.
 */

import { memo } from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { colors } from '@/constants/colors'
import { spacing, radius } from '@/constants/spacing'
import { fontFamilies } from '@/constants/typography'
import type { RoutineItemKind } from '@/lib/supabase/types'

interface Props {
  visible: boolean
  onClose: () => void
  onChoose: (kind: RoutineItemKind) => void
  /** Bucket suggéré (classifieur) : affiche un badge « Suggéré » discret. */
  suggested?: RoutineItemKind | null
}

export const RoutineBucketSheet = memo(function RoutineBucketSheet({
  visible,
  onClose,
  onChoose,
  suggested = null,
}: Props) {
  const insets = useSafeAreaInsets()

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>Ajouter à…</Text>

          <Pressable
            style={[styles.choice, suggested === 'routine' && styles.choiceSuggested]}
            onPress={() => onChoose('routine')}
            accessibilityRole="button"
            accessibilityLabel="Ajouter à ma routine soin"
          >
            <View style={[styles.icon, { backgroundColor: colors.roseSoft }]}>
              <Ionicons name="sparkles-outline" size={22} color={colors.rose} />
            </View>
            <View style={styles.choiceText}>
              <View style={styles.choiceTitleRow}>
                <Text style={styles.choiceTitle}>Ma routine soin</Text>
                {suggested === 'routine' && <SuggestedBadge />}
              </View>
              <Text style={styles.choiceDesc}>Soins visage, organisés matin et soir.</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.inkLight} />
          </Pressable>

          <Pressable
            style={[styles.choice, suggested === 'staple' && styles.choiceSuggested]}
            onPress={() => onChoose('staple')}
            accessibilityRole="button"
            accessibilityLabel="Ajouter à mes produits du quotidien"
          >
            <View style={[styles.icon, { backgroundColor: colors.accentSoft }]}>
              <Ionicons name="cart-outline" size={22} color={colors.accent} />
            </View>
            <View style={styles.choiceText}>
              <View style={styles.choiceTitleRow}>
                <Text style={styles.choiceTitle}>Produits du quotidien</Text>
                {suggested === 'staple' && <SuggestedBadge />}
              </View>
              <Text style={styles.choiceDesc}>Déo, dentifrice, gel douche… simple liste.</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.inkLight} />
          </Pressable>

          <Text style={styles.explain}>
            Ta routine soin regroupe tes soins visage suivis matin/soir et reliés à ton score de
            peau. Les produits du quotidien sont tes essentiels d'hygiène, gardés en simple liste
            sans matin ni soir.
          </Text>
        </View>
      </View>
    </Modal>
  )
})

function SuggestedBadge() {
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>Suggéré</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.45)' },
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
    marginBottom: spacing.md,
  },
  title: { fontFamily: fontFamilies.bold, fontSize: 16, color: colors.ink, marginBottom: spacing.md },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.gray50,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.base,
    marginBottom: spacing.sm,
  },
  choiceSuggested: { borderColor: colors.rose, backgroundColor: colors.surface },
  icon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceText: { flex: 1 },
  choiceTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  choiceTitle: { fontFamily: fontFamilies.semiBold, fontSize: 15, color: colors.ink },
  choiceDesc: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    color: colors.inkMuted,
    marginTop: 2,
  },
  badge: {
    backgroundColor: colors.roseSoft,
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: { fontFamily: fontFamilies.semiBold, fontSize: 10, color: colors.roseDeep },
  explain: {
    fontFamily: fontFamilies.regular,
    fontSize: 11.5,
    lineHeight: 16,
    fontStyle: 'italic',
    color: colors.inkLight,
    marginTop: spacing.sm,
  },
})
