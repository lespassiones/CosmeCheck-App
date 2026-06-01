/**
 * ProductRow — ligne d'ingrédient dans la liste détaillée d'une analyse.
 *
 * Miroir mobile de la ligne <tr> de l'ItemsTable web (CosmetWiki
 * AnalyseResultPanel.tsx) : nom INCI joli + traduction FR / "Non reconnu",
 * fonction principale, chip de tolérance coloré (ColorChip), badge "≤ 1 %"
 * (thresholdContext), liseré orange + icône si l'ingrédient est restreint,
 * et une flèche → vers la fiche ingrédient.
 *
 * Purement présentationnel : `onPress(slug)` est émis uniquement si un slug
 * existe. Tap sur toute la ligne.
 */

import { memo, type FC } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import { colors } from '@/constants/colors'
import { fontFamilies } from '@/constants/typography'
import { normalizeColor, type AnalyseItem, type ColorRating } from '@/lib/analysis/types'

interface Props {
  item: AnalyseItem
  onPress: (slug: string) => void
  isRestricted?: boolean
  isHighlighted?: boolean
}

/** Capitalise chaque mot d'un nom INCI ("aqua" → "Aqua"). */
function prettyName(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}

const ProductRowBase: FC<Props> = ({ item, onPress, isRestricted = false, isHighlighted = false }) => {
  const slug = item.slug
  const hasSlug = !!slug
  const displayName = prettyName(item.name ?? item.input ?? '-')
  const effective = normalizeColor(item.colorRating ?? item.dbColorRating ?? null)
  const showThreshold =
    item.thresholdContext === 'after_fragrance' || item.thresholdContext === 'after_preservative'

  return (
    <Pressable
      onPress={() => hasSlug && onPress(slug as string)}
      disabled={!hasSlug}
      accessibilityRole={hasSlug ? 'button' : undefined}
      accessibilityLabel={hasSlug ? `Voir la fiche de ${displayName}` : displayName}
      style={({ pressed }) => [
        styles.row,
        isRestricted && styles.rowRestricted,
        isHighlighted && styles.rowHighlighted,
        pressed && hasSlug && styles.rowPressed,
      ]}
    >
      {/* Colonne nom + traduction */}
      <View style={styles.nameCol}>
        <Text style={styles.name} numberOfLines={1}>
          {displayName}
        </Text>
        {item.translationFr ? (
          <Text style={styles.translation} numberOfLines={1}>
            {item.translationFr}
          </Text>
        ) : item.matchKind == null ? (
          <Text style={styles.unknown}>Non reconnu</Text>
        ) : null}
        {item.primaryFunction ? (
          <Text style={styles.fn} numberOfLines={1}>
            {item.primaryFunction}
          </Text>
        ) : null}
      </View>

      {/* Colonne tolérance + badge trace */}
      <View style={styles.toleranceCol}>
        <ColorChip rating={effective} />
        {showThreshold ? (
          <View style={styles.traceBadge}>
            <Text style={styles.traceText}>≤ 1 %</Text>
          </View>
        ) : null}
      </View>

      {/* Icône restriction + flèche */}
      {isRestricted ? (
        <Ionicons name="warning" size={16} color={colors.rating.orange.text} style={styles.warnIcon} />
      ) : null}
      <Ionicons
        name="chevron-forward"
        size={16}
        color={hasSlug ? colors.inkLight : colors.border}
      />
    </Pressable>
  )
}

export const ProductRow = memo(ProductRowBase)

// ── ColorChip (dot + libellé coloré) ────────────────────────────────────────

function ColorChip({ rating }: { rating: ColorRating | null }) {
  if (!rating) {
    return (
      <View style={styles.chipRow}>
        <View style={[styles.dot, { backgroundColor: colors.border }]} />
        <Text style={styles.chipNeutral}>-</Text>
      </View>
    )
  }
  const tone = colors.rating[rating]
  const label = CHIP_LABEL[rating]
  return (
    <View style={styles.chipRow}>
      <View style={[styles.dot, { backgroundColor: tone.DEFAULT }]} />
      <Text style={[styles.chipText, { color: tone.text }]}>{label}</Text>
    </View>
  )
}

const CHIP_LABEL: Record<ColorRating, string> = {
  vert: 'Vert',
  jaune: 'Jaune',
  orange: 'Orange',
  rouge: 'Rouge',
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray100,
  },
  rowRestricted: {
    backgroundColor: 'rgba(234,88,12,0.05)',
  },
  rowHighlighted: {
    backgroundColor: colors.roseSoft,
  },
  rowPressed: {
    opacity: 0.6,
  },
  nameCol: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 14,
    color: colors.ink,
  },
  translation: {
    fontFamily: fontFamilies.regular,
    fontSize: 11,
    color: colors.inkMuted,
    marginTop: 1,
  },
  unknown: {
    fontFamily: fontFamilies.regular,
    fontSize: 11,
    color: colors.inkLight,
    marginTop: 1,
  },
  fn: {
    fontFamily: fontFamilies.regular,
    fontSize: 11,
    color: colors.inkLight,
    marginTop: 2,
  },
  toleranceCol: {
    alignItems: 'flex-start',
    gap: 4,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  chipText: {
    fontFamily: fontFamilies.medium,
    fontSize: 13,
  },
  chipNeutral: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    color: colors.inkLight,
  },
  traceBadge: {
    backgroundColor: colors.infoSoft,
    borderRadius: 9999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  traceText: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 10,
    color: colors.info,
  },
  warnIcon: {
    marginLeft: -2,
  },
})
