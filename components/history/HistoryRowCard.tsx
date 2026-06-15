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
import { WhiteCard } from '@/components/design/WhiteCard'
import { IngredientBlob } from '@/components/design/IngredientBlob'
import type { ColorRating } from '@/lib/analysis/types'

/** Affichage de la date relative (« il y a 8 h »). Désactivé pour libérer de la
 *  place au nom du produit. Repasser à true pour le réactiver. */
const SHOW_DATE = false

export interface HistoryItemView {
  id: string
  title: string
  category: string | null
  score: number | null
  rating: ColorRating
  counts: { vert: number; jaune: number; orange: number; rouge: number }
  dateLabel: string
  latestCoherenceId: string | null
  favori: boolean
}

interface Props {
  item: HistoryItemView
  selectMode: boolean
  selected: boolean
  onPress: () => void
  onToggleSelect: () => void
  onOpenActions: () => void
  onAnalysePromesse: () => void
  onToggleFavori: () => void
}

export const HistoryRowCard = memo(function HistoryRowCard({
  item,
  selectMode,
  selected,
  onPress,
  onToggleSelect,
  onOpenActions,
  onAnalysePromesse,
  onToggleFavori,
}: Props) {
  if (selectMode) {
    return (
      <WhiteCard
        onPress={onToggleSelect}
        padding={spacing.base}
        borderRadius={radius.lg}
        style={selected ? styles.cardSelected : undefined}
      >
        <View style={styles.row}>
          <View style={[styles.checkbox, selected && styles.checkboxOn]}>
            {selected && <Ionicons name="checkmark" size={14} color={colors.surface} />}
          </View>
          <View style={styles.blobWrapSm}>
            <IngredientBlob counts={item.counts} variant="sm" width={56} />
          </View>
          <View style={styles.main}>
            <Text style={styles.title} numberOfLines={1}>
              {item.title}
            </Text>
            {SHOW_DATE ? <Text style={styles.date}>{item.dateLabel}</Text> : null}
          </View>
        </View>
      </WhiteCard>
    )
  }

  const hasCoherence = Boolean(item.latestCoherenceId)

  return (
    <WhiteCard onPress={onPress} padding={spacing.base} borderRadius={radius.lg}>
      <View style={styles.row}>
        <View style={styles.blobWrap}>
          <IngredientBlob counts={item.counts} variant="sm" width={88} />
        </View>
        <View style={styles.main}>
          <View style={styles.titleRow}>
            <View style={styles.titleCol}>
              <Text style={styles.title} numberOfLines={1}>
                {item.title}
              </Text>
              {item.category ? (
                <Text style={styles.subtitle} numberOfLines={1}>
                  {item.category}
                </Text>
              ) : null}
            </View>
            {SHOW_DATE ? (
              <Text style={styles.date} numberOfLines={1}>
                {item.dateLabel}
              </Text>
            ) : null}
          </View>

          <View style={styles.bottomRow}>
            <Pressable
              onPress={onAnalysePromesse}
              style={[
                styles.promesseCta,
                { borderColor: hasCoherence ? colors.success : colors.accent },
              ]}
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

            <View style={styles.actions}>
              <Pressable
                onPress={onToggleFavori}
                hitSlop={8}
                style={styles.kebab}
                accessibilityRole="button"
                accessibilityLabel={item.favori ? 'Retirer des favoris' : 'Ajouter aux favoris'}
              >
                <Ionicons
                  name={item.favori ? 'bookmark' : 'bookmark-outline'}
                  size={18}
                  color={item.favori ? colors.rose : colors.inkMuted}
                />
              </Pressable>
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
          </View>
        </View>
      </View>
    </WhiteCard>
  )
})

const styles = StyleSheet.create({
  cardSelected: { borderWidth: 2, borderColor: colors.ink },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  blobWrap: { width: 88, justifyContent: 'center' },
  blobWrapSm: { width: 56, justifyContent: 'center' },
  main: { flex: 1, minWidth: 0 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  titleCol: { flex: 1, minWidth: 0 },
  title: { ...typography.bodySemiBold, color: colors.ink },
  subtitle: { ...typography.xs, color: colors.inkMuted, marginTop: 2 },
  date: { ...typography.xs, color: colors.inkLight, flexShrink: 0 },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
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
    gap: 5,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.full,
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  promesseText: { ...typography.xsSemiBold },
})
