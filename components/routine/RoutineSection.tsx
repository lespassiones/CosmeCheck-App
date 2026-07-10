/**
 * RoutineSection — une section de la routine (MATIN ou SOIR) avec drag-reorder.
 *
 * Drag custom (pas de lib externe : 3 à 10 lignes par section) :
 * - le geste Pan est attaché UNIQUEMENT à la poignée (≡) de chaque ligne,
 *   activé après un appui long court (180 ms) pour ne pas gêner le scroll ;
 * - les cartes ont une HAUTEUR FIXE (ROUTINE_CARD_STEP) : l'index cible est
 *   round(translationY / STEP), trivial et robuste ;
 * - la ligne active suit le doigt (translateY direct), les voisines se
 *   décalent en withTiming ; haptique à la prise et à chaque changement de cible ;
 * - au lâcher : onReorder(sectionKey, orderedItemIds) → le parent persiste
 *   (optimiste) et la LinearTransition anime la mise en place finale ;
 * - pendant le drag, onDragStateChange(true) permet au parent de geler le
 *   scroll du ScrollView (sinon les deux gestes se battent).
 *
 * Un produit 'both' apparaît dans les DEUX sections (clé React par section).
 */

import { memo, useCallback, useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'

/**
 * Transition de mise en place douce, SANS rebond : la carte se soulève, glisse
 * jusqu'à sa place et se pose (easing cubic, pas de spring). Utilisée par la
 * réorganisation et le drag.
 */
const SMOOTH_LAYOUT = LinearTransition.duration(340).easing(Easing.inOut(Easing.cubic))
import * as Haptics from 'expo-haptics'

import { colors } from '@/constants/colors'
import { spacing, radius } from '@/constants/spacing'
import { fontFamilies } from '@/constants/typography'
import type { RoutineFrequency, RoutineTimeOfDay } from '@/lib/supabase/types'
import type { BlobCounts } from '@/components/design/IngredientBlob'
import {
  RoutineProductCard,
  ROUTINE_CARD_GAP,
  ROUTINE_CARD_STEP,
} from '@/components/routine/RoutineProductCard'

export type RoutineSectionKey = 'morning' | 'evening'

/** Modèle de ligne pré-calculé par RoutineSectionList. */
export interface RoutineSectionRow {
  itemId: string
  analysisId: string
  name: string
  brand: string | null
  ean: string | null
  fallbackImageUrl: string | null
  counts: BlobCounts | null
  frequency: RoutineFrequency
  timeOfDay: RoutineTimeOfDay
}

interface Props {
  sectionKey: RoutineSectionKey
  rows: RoutineSectionRow[]
  /** Tap sur une carte -> sous-page de l'item (id = routine_items.id). */
  onPressItem: (itemId: string) => void
  onReorder: (sectionKey: RoutineSectionKey, orderedItemIds: string[]) => void
  onDragStateChange: (dragging: boolean) => void
}

function hapticTick(): void {
  Haptics.selectionAsync().catch(() => {})
}

export const RoutineSection = memo(function RoutineSection({
  sectionKey,
  rows,
  onPressItem,
  onReorder,
  onDragStateChange,
}: Props) {
  // Index (dans la section) de la ligne en cours de drag ; -1 = repos.
  const activeIndex = useSharedValue(-1)
  // Index cible courant du drop.
  const targetIndex = useSharedValue(-1)
  // Translation Y de la ligne active (suit le doigt).
  const dragY = useSharedValue(0)

  const orderedIds = useMemo(() => rows.map((r) => r.itemId), [rows])

  const commitReorder = useCallback(
    (from: number, to: number) => {
      onDragStateChange(false)
      if (from !== to && from >= 0 && to >= 0 && from < orderedIds.length && to < orderedIds.length) {
        const next = [...orderedIds]
        const [moved] = next.splice(from, 1)
        next.splice(to, 0, moved)
        onReorder(sectionKey, next)
      }
      // Reset APRÈS la mise à jour optimiste du parent (même task JS + rAF) :
      // la ligne retombe sur sa nouvelle place naturelle sans aller-retour visuel.
      requestAnimationFrame(() => {
        activeIndex.value = -1
        targetIndex.value = -1
        dragY.value = 0
      })
    },
    [orderedIds, onReorder, sectionKey, onDragStateChange, activeIndex, targetIndex, dragY],
  )

  const startDrag = useCallback(() => {
    onDragStateChange(true)
    hapticTick()
  }, [onDragStateChange])

  const isMorning = sectionKey === 'morning'

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Ionicons
          name={isMorning ? 'sunny' : 'moon'}
          size={18}
          color={isMorning ? '#F59E0B' : '#6366F1'}
        />
        <Text style={styles.headerTitle}>{isMorning ? 'MATIN' : 'SOIR'}</Text>
        {rows.length > 0 && <Text style={styles.headerCount}>{rows.length}</Text>}
      </View>

      {rows.length === 0 ? (
        <View style={styles.emptyRow}>
          <Text style={styles.emptyText}>
            {isMorning
              ? 'Aucun soin le matin. Ouvre un produit pour le placer ici, ou lance « Réorganiser ma routine ».'
              : 'Aucun soin le soir. Ouvre un produit pour le placer ici, ou lance « Réorganiser ma routine ».'}
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {rows.map((row, index) => (
            <DraggableRow
              key={`${sectionKey}-${row.itemId}`}
              row={row}
              index={index}
              count={rows.length}
              activeIndex={activeIndex}
              targetIndex={targetIndex}
              dragY={dragY}
              onDragStart={startDrag}
              onDragEnd={commitReorder}
              onPressItem={onPressItem}
            />
          ))}
        </View>
      )}
    </View>
  )
})

interface DraggableRowProps {
  row: RoutineSectionRow
  index: number
  count: number
  activeIndex: SharedValue<number>
  targetIndex: SharedValue<number>
  dragY: SharedValue<number>
  onDragStart: () => void
  onDragEnd: (from: number, to: number) => void
  onPressItem: (itemId: string) => void
}

const DraggableRow = memo(function DraggableRow({
  row,
  index,
  count,
  activeIndex,
  targetIndex,
  dragY,
  onDragStart,
  onDragEnd,
  onPressItem,
}: DraggableRowProps) {
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(180)
        .shouldCancelWhenOutside(false)
        .onStart(() => {
          activeIndex.value = index
          targetIndex.value = index
          dragY.value = 0
          runOnJS(onDragStart)()
        })
        .onUpdate((e) => {
          dragY.value = e.translationY
          const raw = Math.round((index * ROUTINE_CARD_STEP + e.translationY) / ROUTINE_CARD_STEP)
          const clamped = Math.min(count - 1, Math.max(0, raw))
          if (clamped !== targetIndex.value) {
            targetIndex.value = clamped
            runOnJS(hapticTick)()
          }
        })
        .onFinalize(() => {
          const from = activeIndex.value
          const to = targetIndex.value
          // Fige la ligne active à son offset final le temps du commit (le reset
          // se fait côté JS après la mise à jour optimiste, cf. commitReorder).
          if (from === index && to >= 0) {
            dragY.value = (to - from) * ROUTINE_CARD_STEP
          }
          runOnJS(onDragEnd)(from, to)
        }),
    [index, count, activeIndex, targetIndex, dragY, onDragStart, onDragEnd],
  )

  const animatedStyle = useAnimatedStyle(() => {
    const a = activeIndex.value
    if (a === index) {
      // Ligne saisie : suit le doigt, légèrement soulevée.
      return {
        zIndex: 10,
        elevation: 10,
        transform: [{ translateY: dragY.value }, { scale: withTiming(1.02, { duration: 120 }) }],
        shadowOpacity: withTiming(0.18, { duration: 120 }),
      }
    }
    if (a === -1) {
      return {
        zIndex: 0,
        elevation: 0,
        transform: [{ translateY: withTiming(0, { duration: 150 }) }, { scale: withTiming(1, { duration: 120 }) }],
        shadowOpacity: 0,
      }
    }
    // Lignes voisines : s'écartent pour matérialiser la place de drop.
    const t = targetIndex.value
    let offset = 0
    if (index > a && index <= t) offset = -ROUTINE_CARD_STEP
    else if (index < a && index >= t) offset = ROUTINE_CARD_STEP
    return {
      zIndex: 0,
      elevation: 0,
      transform: [{ translateY: withTiming(offset, { duration: 150 }) }, { scale: 1 }],
      shadowOpacity: 0,
    }
  })

  return (
    <Animated.View
      style={[styles.rowWrap, animatedStyle]}
      layout={SMOOTH_LAYOUT}
      entering={FadeIn.duration(220)}
      exiting={FadeOut.duration(180)}
    >
      {/* Le geste enveloppe TOUTE la carte : appui long -> drag ; tap court ->
          sous-page de l'item (géré par le Pressable de la carte). */}
      <GestureDetector gesture={pan}>
        <Animated.View>
          <RoutineProductCard
            itemId={row.itemId}
            analysisId={row.analysisId}
            displayIndex={index + 1}
            name={row.name}
            brand={row.brand}
            ean={row.ean}
            fallbackImageUrl={row.fallbackImageUrl}
            counts={row.counts}
            onPress={onPressItem}
            showIndex
          />
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  )
})

const styles = StyleSheet.create({
  section: {
    marginBottom: spacing.base,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.sm,
    paddingHorizontal: 2,
  },
  headerTitle: {
    fontFamily: fontFamilies.bold,
    fontSize: 16,
    letterSpacing: 1,
    color: colors.ink,
  },
  headerCount: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 13,
    color: colors.inkMuted,
  },
  list: {
    gap: ROUTINE_CARD_GAP,
  },
  rowWrap: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 16,
    borderRadius: radius.lg,
  },
  handle: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  emptyRow: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.gray300,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  emptyText: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    color: colors.inkLight,
  },
})
