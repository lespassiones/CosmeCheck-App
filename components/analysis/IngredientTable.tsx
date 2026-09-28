/**
 * IngredientTable : filtres par couleur + tableau numéroté des ingrédients,
 * contenu de la page « Liste des ingrédients » (/analyse/ingredients/[id]).
 *
 * Filtres : pilules blanches bordées avec un point de couleur (fond jamais
 * teinté), pilule active pleine foncée, pilule vide grisée et non cliquable.
 * Tableau : lignes `ProductRow` dans un cadre blanc arrondi, décollé des bords.
 *
 * `focusPosition` (tap sur une case du spectre) : la liste s'ouvre déjà
 * positionnée sur cet ingrédient.
 */

import { useCallback, useMemo, useRef, useState, type FC } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { HapticPressable as Pressable } from '@/components/shared/HapticPressable'

import { colors } from '@/constants/colors'
import { fontFamilies } from '@/constants/typography'
import { radius, spacing } from '@/constants/spacing'
import {
  normalizeColor,
  type AnalyseItem,
  type AnalyseResponse,
  type ColorRating,
} from '@/lib/analysis/types'

import { ProductRow } from './ProductRow'

type TabKey = 'all' | ColorRating | 'unknown'

// Mêmes mots que la légende des couleurs (ScoreExplainerSheet).
const TAB_LABELS: Record<TabKey, string> = {
  all: 'Tous',
  vert: 'Rien à signaler',
  jaune: 'À surveiller',
  orange: 'Synthèse',
  rouge: 'Controversé',
  unknown: 'Non reconnus',
}

interface Props {
  items: AnalyseItem[]
  counts: AnalyseResponse['counts']
  /** Positions des ingrédients qui touchent une restriction de l'utilisateur. */
  restrictedPositions: Set<number>
  onIngredientPress: (slug: string) => void
  focusPosition?: number | null
  bottomInset?: number
}

/** Couleur d'un ingrédient : colorRating prioritaire, sinon dbColorRating (comme ProductRow). */
function resolvedColor(i: AnalyseItem): ColorRating | null {
  return normalizeColor((i.colorRating ?? i.dbColorRating) as string | null)
}

export const IngredientTable: FC<Props> = ({
  items,
  counts,
  restrictedPositions,
  onIngredientPress,
  focusPosition = null,
  bottomInset = 0,
}) => {
  const [filter, setFilter] = useState<TabKey>('all')

  // Compteurs dérivés des items (même source que la couleur affichée).
  const itemCounts = useMemo(() => {
    const c = { vert: 0, jaune: 0, orange: 0, rouge: 0, unknown: 0 }
    for (const item of items) {
      const rc = resolvedColor(item)
      if (!rc) c.unknown++
      else c[rc]++
    }
    return c
  }, [items])

  const filteredItems = useMemo(() => {
    if (filter === 'all') return items
    if (filter === 'unknown') return items.filter((i) => resolvedColor(i) == null)
    return items.filter((i) => resolvedColor(i) === filter)
  }, [items, filter])

  const tabs: TabKey[] = ['all', 'vert', 'jaune', 'orange', 'rouge']
  if (itemCounts.unknown > 0) tabs.push('unknown')

  // ── Ouverture positionnée sur un ingrédient (spectre) ─────────────────────
  const scrollRef = useRef<ScrollView>(null)
  const tableY = useRef(0)
  const focusDone = useRef(focusPosition == null)
  const onFocusRowLayout = useCallback((y: number) => {
    if (focusDone.current) return
    focusDone.current = true
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: Math.max(0, tableY.current + y - spacing.base), animated: false })
    })
  }, [])

  return (
    <View style={styles.root}>
      <View style={styles.tabsWrap}>
        <View style={styles.tabs}>
          {tabs.map((t) => (
            <FilterChip
              key={t}
              label={TAB_LABELS[t]}
              count={tabCount(counts, t, itemCounts)}
              active={t === filter}
              tone={t}
              onPress={() => setFilter(t)}
            />
          ))}
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: bottomInset + spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        {filteredItems.length === 0 ? (
          <Text style={styles.emptyList}>Aucun ingrédient ne correspond à ce filtre.</Text>
        ) : (
          // Tableau : lignes numérotées dans un cadre blanc, séparées par un filet.
          <View
            style={styles.table}
            onLayout={(e) => {
              tableY.current = e.nativeEvent.layout.y
            }}
          >
            {filteredItems.map((item, index) => (
              <View
                key={`${item.position}-${item.input}`}
                onLayout={
                  item.position === focusPosition
                    ? (e) => onFocusRowLayout(e.nativeEvent.layout.y)
                    : undefined
                }
              >
                <ProductRow
                  item={item}
                  first={index === 0}
                  onPress={onIngredientPress}
                  isRestricted={restrictedPositions.has(item.position)}
                />
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  )
}

// ── Filtre ───────────────────────────────────────────────────────────────────

function FilterChip({
  label,
  count,
  active,
  tone,
  onPress,
}: {
  label: string
  count: number
  active: boolean
  tone: TabKey
  onPress: () => void
}) {
  // Pilule blanche bordée + simple point de couleur (fond jamais teinté) ;
  // filtre actif = pilule pleine foncée ; filtre vide = grisé, non cliquable.
  const dot = tone === 'all' ? null : tone === 'unknown' ? colors.inkLight : colors.rating[tone].DEFAULT
  const empty = count === 0 && !active
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${count}`}
      accessibilityState={{ selected: active, disabled: empty }}
      onPress={onPress}
      haptic="selection"
      disabled={empty}
      style={({ pressed }) => [
        styles.chip,
        active && styles.chipActive,
        empty && styles.chipEmpty,
        pressed && styles.chipPressed,
      ]}
    >
      {dot ? <View style={[styles.chipDot, { backgroundColor: dot }]} /> : null}
      <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
        {label} {count}
      </Text>
    </Pressable>
  )
}

function tabCount(
  counts: AnalyseResponse['counts'],
  t: TabKey,
  derived: { vert: number; jaune: number; orange: number; rouge: number; unknown: number },
): number {
  switch (t) {
    case 'all':     return counts.total
    // Couleurs et "non reconnu" : source dérivée (cohérente avec resolvedColor)
    case 'vert':    return derived.vert
    case 'jaune':   return derived.jaune
    case 'orange':  return derived.orange
    case 'rouge':   return derived.rouge
    case 'unknown': return derived.unknown
  }
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  tabsWrap: { paddingHorizontal: spacing.base, paddingTop: spacing.sm, paddingBottom: spacing.base },
  tabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  chipEmpty: {
    opacity: 0.45,
  },
  chipPressed: {
    opacity: 0.7,
  },
  chipDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  chipLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 14,
    color: colors.ink,
  },
  chipLabelActive: {
    fontFamily: fontFamilies.semiBold,
    color: colors.surface,
  },
  scroll: { flex: 1 },
  content: {},
  // Tableau encadré, décollé des bords de l'écran.
  table: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginHorizontal: spacing.base,
  },
  emptyList: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    color: colors.inkMuted,
    textAlign: 'center',
    paddingVertical: 40,
    paddingHorizontal: spacing.base,
  },
})
