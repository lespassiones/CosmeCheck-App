/**
 * ProductRow : ligne d'ingrédient dans la liste détaillée d'une analyse.
 *
 * Refonte du 28/09/2026 (sur maquette) : une ligne de TABLEAU, sans libellé de
 * couleur en texte.
 *   - à gauche, le rang dans la composition (« 01 ») puis une pastille de
 *     couleur (vert, jaune, orange, rouge ; gris si non reconnu) ;
 *   - le nom INCI en gras, puis « traduction · fonction » sur une seule ligne,
 *     ou « Non reconnu », ou « Dans tes restrictions » ;
 *   - à droite, le badge « ≤ 1 % » (ingrédient en trace), l'icône d'alerte si
 *     l'ingrédient est dans les restrictions, et le chevron vers la fiche.
 * Les séparateurs sont portés par la ligne (`first` = pas de filet au-dessus) ;
 * le cadre du tableau est posé par le parent.
 *
 * Purement présentationnel : `onPress(slug)` est émis uniquement si un slug
 * existe. Tap sur toute la ligne.
 */

import { memo, type FC } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { HapticPressable as Pressable } from '@/components/shared/HapticPressable'
import { Ionicons } from '@expo/vector-icons'

import { colors } from '@/constants/colors'
import { fontFamilies } from '@/constants/typography'
import { normalizeColor, type AnalyseItem } from '@/lib/analysis/types'

interface Props {
  item: AnalyseItem
  onPress: (slug: string) => void
  isRestricted?: boolean
  isHighlighted?: boolean
  /** Première ligne du tableau : pas de filet au-dessus. */
  first?: boolean
}

/** Capitalise chaque mot d'un nom INCI ("aqua" → "Aqua"). */
function prettyName(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}

const UNKNOWN_DOT = '#9CA3AF'

const ProductRowBase: FC<Props> = ({
  item,
  onPress,
  isRestricted = false,
  isHighlighted = false,
  first = false,
}) => {
  const slug = item.slug
  const hasSlug = !!slug
  const displayName = prettyName(item.name ?? item.input ?? '-')
  const effective = normalizeColor(item.colorRating ?? item.dbColorRating ?? null)
  const showThreshold =
    item.thresholdContext === 'after_fragrance' || item.thresholdContext === 'after_preservative'
  const dotColor = effective ? colors.rating[effective].DEFAULT : UNKNOWN_DOT
  const rank = String(item.position).padStart(2, '0')

  // Sous-titre sur une ligne : restriction d'abord, sinon « traduction · fonction ».
  const sub = isRestricted
    ? 'Dans tes restrictions'
    : [item.translationFr, item.primaryFunction].filter(Boolean).join(' · ') ||
      (item.matchKind == null ? 'Non reconnu' : '')

  return (
    <Pressable
      onPress={() => hasSlug && onPress(slug as string)}
      disabled={!hasSlug}
      accessibilityRole={hasSlug ? 'button' : undefined}
      accessibilityLabel={
        hasSlug ? `${item.position}. Voir la fiche de ${displayName}` : `${item.position}. ${displayName}`
      }
      style={({ pressed }) => [
        styles.row,
        !first && styles.rowDivider,
        isRestricted && styles.rowRestricted,
        isHighlighted && styles.rowHighlighted,
        pressed && hasSlug && styles.rowPressed,
      ]}
    >
      <Text style={styles.rank}>{rank}</Text>
      <View style={[styles.dot, { backgroundColor: dotColor }]} />

      <View style={styles.nameCol}>
        <Text style={styles.name} numberOfLines={1}>
          {displayName}
        </Text>
        {sub ? (
          <Text style={styles.sub} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>

      {showThreshold ? (
        <View style={styles.traceBadge}>
          <Text style={styles.traceText}>≤ 1 %</Text>
        </View>
      ) : null}
      {isRestricted ? (
        <Ionicons name="warning-outline" size={18} color={colors.rating.orange.text} />
      ) : null}
      {hasSlug ? <Ionicons name="chevron-forward" size={16} color={colors.inkLight} /> : null}
    </Pressable>
  )
}

export const ProductRow = memo(ProductRowBase)

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: colors.surface,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  rowRestricted: {
    backgroundColor: '#FFF4EC',
  },
  rowHighlighted: {
    backgroundColor: colors.roseSoft,
  },
  rowPressed: {
    opacity: 0.6,
  },
  rank: {
    width: 22,
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    color: colors.inkLight,
    fontVariant: ['tabular-nums'],
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  nameCol: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    color: colors.ink,
  },
  sub: {
    fontFamily: fontFamilies.regular,
    fontSize: 12.5,
    color: colors.inkMuted,
    marginTop: 2,
  },
  traceBadge: {
    backgroundColor: colors.gray100,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 9999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  traceText: {
    fontFamily: fontFamilies.medium,
    fontSize: 11,
    color: colors.inkMuted,
  },
})
