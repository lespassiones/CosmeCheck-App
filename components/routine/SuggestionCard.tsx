/**
 * SuggestionCard — carte « Alternative plus clean » (avant → après).
 * Présentational : ton produit (gauche, élément le plus dangereux) → alternative
 * (droite, respecte tes restrictions). Pastilles de tier (pas de note chiffrée).
 * Bouton « Garder en favori » + lien « Voir l'analyse ».
 */
import { type FC } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { Image } from 'expo-image'
import { Ionicons } from '@expo/vector-icons'

import { colors } from '@/constants/colors'
import { radius, spacing } from '@/constants/spacing'
import { typography } from '@/constants/typography'
import { TierDots } from './TierDots'
import type { AlternativeProduct } from '@/lib/analysis/alternativesFilter'

interface Props {
  productTitle: string
  productScore: number | null
  /** Photo du produit de la routine (catalogue), sinon placeholder. */
  productImageUrl?: string | null
  dangerLabel: string | null
  dangerColor: 'rouge' | 'orange' | null
  alternative: AlternativeProduct
  /** Score plafonné de l'alternative (pour les pastilles). */
  alternativeScore: number
  /** Justification IA personnalisée (« pour ta peau sensible… »). */
  reason?: string | null
  keeping: boolean
  /** Comparaison en cours de préparation (crée l'analyse alt + débit) → spinner sur le lien. */
  comparing: boolean
  /** Déjà ajouté en favori → bouton verrouillé (anti-doublon). */
  kept: boolean
  onKeep: () => void
  onCompare: () => void
  onOpenAlternative: () => void
}

export const SuggestionCard: FC<Props> = ({
  productTitle,
  productScore,
  productImageUrl,
  dangerLabel,
  dangerColor,
  alternative,
  alternativeScore,
  reason,
  keeping,
  comparing,
  kept,
  onKeep,
  onCompare,
  onOpenAlternative,
}) => {
  const altTitle = alternative.name ?? 'Alternative'
  return (
    <View style={styles.card}>
      {/* En-tête */}
      <View style={styles.header}>
        <Ionicons name="sparkles" size={15} color={colors.accent} />
        <Text style={styles.headerText}>Alternative plus clean</Text>
        <Ionicons name="trending-up" size={16} color={colors.success} />
      </View>

      {reason ? (
        <Text style={styles.reason} numberOfLines={3}>
          {reason}
        </Text>
      ) : null}

      {/* Avant → Après */}
      <View style={styles.compareRow}>
        <View style={styles.side}>
          {productImageUrl ? (
            <Image
              source={{ uri: productImageUrl }}
              style={styles.thumb}
              contentFit="contain"
              cachePolicy="memory-disk"
              transition={120}
            />
          ) : (
            <View style={styles.thumbPlaceholder}>
              <Ionicons name="cube-outline" size={26} color={colors.inkLight} />
            </View>
          )}
          <Text style={styles.sideTitle} numberOfLines={2}>{productTitle}</Text>
          <TierDots score={productScore} />
          {dangerColor ? (
            <View
              style={[
                styles.badge,
                dangerColor === 'rouge' ? styles.badgeRouge : styles.badgeOrange,
              ]}
            >
              <Text style={styles.badgeRougeText} numberOfLines={1}>
                {dangerColor === 'rouge' ? 'À éviter' : 'À surveiller'}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.arrowWrap}>
          <Ionicons name="arrow-forward" size={20} color={colors.rose} />
        </View>

        <Pressable style={styles.side} onPress={onOpenAlternative} accessibilityRole="button">
          {alternative.imageUrl ? (
            <Image
              source={{ uri: alternative.imageUrl }}
              style={styles.thumb}
              contentFit="contain"
              cachePolicy="memory-disk"
              transition={120}
            />
          ) : (
            <View style={styles.thumbPlaceholder}>
              <Ionicons name="leaf-outline" size={26} color={colors.success} />
            </View>
          )}
          <Text style={styles.sideTitle} numberOfLines={2}>{altTitle}</Text>
          <TierDots score={alternativeScore} />
          <View style={[styles.badge, styles.badgeVert]}>
            <Text style={styles.badgeVertText} numberOfLines={1}>Respecte tes restrictions</Text>
          </View>
        </Pressable>
      </View>

      {/* Bouton garder en favori (verrouillé une fois ajouté → anti-doublon) */}
      <Pressable
        style={[styles.keepBtn, kept && styles.keepBtnDone, (keeping || comparing) && styles.keepBtnDisabled]}
        onPress={onKeep}
        disabled={keeping || comparing || kept}
        accessibilityRole="button"
      >
        {keeping ? (
          <ActivityIndicator color={colors.surface} size="small" />
        ) : kept ? (
          <>
            <Ionicons name="checkmark-circle" size={17} color={colors.surface} />
            <Text style={styles.keepText}>Ajouté en favori</Text>
          </>
        ) : (
          <>
            <Ionicons name="bookmark" size={16} color={colors.surface} />
            <Text style={styles.keepText}>Garder en favori</Text>
          </>
        )}
      </Pressable>
      <Pressable
        onPress={onCompare}
        hitSlop={8}
        style={[styles.linkWrap, (comparing || keeping) && styles.keepBtnDisabled]}
        disabled={comparing || keeping}
      >
        {comparing ? (
          <ActivityIndicator size="small" color={colors.inkMuted} />
        ) : (
          <Ionicons name="git-compare-outline" size={13} color={colors.inkMuted} />
        )}
        <Text style={styles.link}>{comparing ? 'Préparation…' : 'Comparer les deux produits'}</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.lg,
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: '#F3EEFF',
    borderRadius: radius.full,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    marginBottom: spacing.base,
  },
  headerText: { ...typography.bodySemiBold, color: colors.accent },
  reason: { ...typography.small, color: colors.inkMuted, marginTop: spacing.xs, marginBottom: spacing.sm },
  compareRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  side: { flex: 1, alignItems: 'center', gap: spacing.sm },
  arrowWrap: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface, marginTop: 50,
    shadowColor: '#0F172A', shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  thumb: { width: 104, height: 158, borderRadius: radius.md },
  thumbPlaceholder: {
    width: 104, height: 158, borderRadius: radius.md, backgroundColor: colors.gray100,
    alignItems: 'center', justifyContent: 'center',
  },
  sideTitle: { ...typography.xsSemiBold, color: colors.ink, textAlign: 'center', minHeight: 34 },
  badge: { borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 4, maxWidth: '100%' },
  badgeRouge: { backgroundColor: colors.rose },
  badgeOrange: { backgroundColor: '#F97316' },
  badgeRougeText: { ...typography.xs, color: colors.surface, fontWeight: '600' },
  badgeVert: { backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#A7F3D0' },
  badgeVertText: { ...typography.xs, color: '#047857', fontWeight: '600' },
  keepBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    backgroundColor: colors.success, borderRadius: radius.full, paddingVertical: spacing.md,
    marginTop: spacing.lg, minHeight: 50,
  },
  keepBtnDone: { backgroundColor: colors.success },
  keepBtnDisabled: { opacity: 0.6 },
  keepText: { ...typography.button, color: colors.surface },
  linkWrap: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'center', marginTop: spacing.md },
  link: { ...typography.xsSemiBold, color: colors.inkMuted, textDecorationLine: 'underline' },
})
