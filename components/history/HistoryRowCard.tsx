/**
 * HistoryRowCard — une carte de la liste d'historique.
 *
 * Twin RN du <li> de components/history/HistoryList.tsx (web). Affiche :
 *  - le demi-donut (IngredientBlob variant sm) de répartition des couleurs ;
 *  - le titre (nom > product_label > fallback) + chip catégorie ;
 *  - la date (date-fns, locale fr) ;
 *  - le ColorBadge score ;
 *  - une CTA "Analyser la promesse" / "Voir l'analyse de la promesse" ;
 *  - un bouton kebab (•••) ouvrant la feuille d'actions.
 *
 * En mode sélection (comparaison), la carte devient un toggle avec coche, et
 * masque les CTA / kebab.
 */

import { memo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import { colors } from '@/constants/colors'
import { radius, spacing } from '@/constants/spacing'
import { typography } from '@/constants/typography'
import { NeuCard } from '@/components/design/NeuCard'
import { ColorBadge } from '@/components/design/ColorBadge'
import { IngredientBlob } from '@/components/design/IngredientBlob'
import type { ColorRating } from '@/lib/analysis/types'

export interface HistoryItemView {
  id: string
  title: string
  category: string | null
  score: number | null
  rating: ColorRating
  counts: { vert: number; jaune: number; orange: number; rouge: number }
  dateLabel: string
  latestCoherenceId: string | null
}

interface Props {
  item: HistoryItemView
  selectMode: boolean
  selected: boolean
  onPress: () => void
  onToggleSelect: () => void
  onOpenActions: () => void
  onAnalysePromesse: () => void
}

export const HistoryRowCard = memo(function HistoryRowCard({
  item,
  selectMode,
  selected,
  onPress,
  onToggleSelect,
  onOpenActions,
  onAnalysePromesse,
}: Props) {
  if (selectMode) {
    return (
      <NeuCard
        onPress={onToggleSelect}
        padding={spacing.base}
        style={[styles.card, selected && styles.cardSelected]}
      >
        <View style={styles.row}>
          <View style={[styles.checkbox, selected && styles.checkboxOn]}>
            {selected && <Ionicons name="checkmark" size={14} color={colors.surface} />}
          </View>
          <View style={styles.blobWrap}>
            <IngredientBlob counts={item.counts} variant="sm" width={56} />
          </View>
          <View style={styles.main}>
            <Text style={styles.title} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.date}>{item.dateLabel}</Text>
          </View>
        </View>
      </NeuCard>
    )
  }

  const hasCoherence = Boolean(item.latestCoherenceId)

  return (
    <NeuCard onPress={onPress} padding={spacing.base} style={styles.card}>
      <View style={styles.row}>
        <View style={styles.blobWrap}>
          <IngredientBlob counts={item.counts} variant="sm" width={56} />
        </View>
        <View style={styles.main}>
          <Text style={styles.title} numberOfLines={1}>
            {item.title}
          </Text>
          {item.category ? (
            <View style={styles.categoryChip}>
              <Text style={styles.categoryText}>{item.category}</Text>
            </View>
          ) : null}
          <Text style={styles.date}>{item.dateLabel}</Text>
        </View>
        <ColorBadge rating={item.rating} variant="full" score={item.score ?? undefined} size="sm" />
        <Pressable
          onPress={onOpenActions}
          hitSlop={8}
          style={styles.kebab}
          accessibilityRole="button"
          accessibilityLabel="Plus d'actions"
        >
          <Ionicons name="ellipsis-vertical" size={18} color={colors.inkMuted} />
        </Pressable>
      </View>

      <Pressable
        onPress={onAnalysePromesse}
        style={styles.promesseCta}
        accessibilityRole="button"
      >
        <Ionicons
          name="sparkles"
          size={13}
          color={hasCoherence ? colors.success : colors.accent}
        />
        <Text
          style={[
            styles.promesseText,
            { color: hasCoherence ? colors.success : colors.accent },
          ]}
        >
          {hasCoherence ? "Voir l'analyse de la promesse" : 'Analyser la promesse'}
        </Text>
      </Pressable>
    </NeuCard>
  )
})

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg },
  cardSelected: { borderWidth: 2, borderColor: colors.ink },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  blobWrap: { width: 56, justifyContent: 'center' },
  main: { flex: 1, minWidth: 0 },
  title: { ...typography.bodySemiBold, color: colors.ink },
  date: { ...typography.xs, color: colors.inkMuted, marginTop: 2 },
  categoryChip: {
    alignSelf: 'flex-start',
    marginTop: 3,
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
    borderRadius: radius.full,
    backgroundColor: colors.borderMuted,
  },
  categoryText: { ...typography.caption, color: colors.inkMuted },
  kebab: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.inkLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  promesseCta: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.full,
    backgroundColor: colors.accentSoft,
  },
  promesseText: { ...typography.xsSemiBold },
})
