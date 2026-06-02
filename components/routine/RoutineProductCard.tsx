/**
 * RoutineProductCard — carte produit de la routine.
 *
 * Port mobile de RoutineProductRow (web). Affiche : mini-blob de répartition
 * couleur, nom du produit, sélecteur de fréquence 3 segments
 * (Quotidien / Hebdo / Mensuel → useRoutine().updateFrequency, optimiste), et
 * un swipe-to-delete (react-native-gesture-handler) avec confirmation.
 *
 * - Tap sur la carte → onPress(analysisId) (détail analyse).
 * - Swipe vers la gauche → révèle un bouton « Supprimer » rouge ; tap → onDelete.
 * - Changement de segment → onFrequencyChange(itemId, freq).
 */

import { memo, useCallback } from 'react'
import { StyleSheet, Text, View, Pressable } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  runOnJS,
} from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'

import { colors } from '@/constants/colors'
import { spacing, radius } from '@/constants/spacing'
import { fontFamilies } from '@/constants/typography'
import type { RoutineFrequency } from '@/lib/supabase/types'
import { IngredientBlob, type BlobCounts } from '@/components/design/IngredientBlob'

const ACTION_WIDTH = 84

const FREQ_OPTIONS: { value: RoutineFrequency; label: string }[] = [
  { value: 'daily', label: 'Quotidien' },
  { value: 'weekly', label: 'Hebdo' },
  { value: 'monthly', label: 'Mensuel' },
]

interface Props {
  itemId: string
  analysisId: string
  name: string
  counts: BlobCounts | null
  frequency: RoutineFrequency
  onPress: (analysisId: string) => void
  onDelete: (itemId: string, name: string) => void
  onFrequencyChange: (itemId: string, frequency: RoutineFrequency) => void
}

export const RoutineProductCard = memo(function RoutineProductCard({
  itemId,
  analysisId,
  name,
  counts,
  frequency,
  onPress,
  onDelete,
  onFrequencyChange,
}: Props) {
  const translateX = useSharedValue(0)
  const opened = useSharedValue(false)

  const triggerDelete = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {})
    onDelete(itemId, name)
  }, [itemId, name, onDelete])

  const closeSwipe = useCallback(() => {
    translateX.value = withSpring(0, { damping: 20 })
    opened.value = false
  }, [translateX, opened])

  const pan = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-12, 12])
    .onUpdate((e) => {
      const base = opened.value ? -ACTION_WIDTH : 0
      const next = base + e.translationX
      translateX.value = Math.min(0, Math.max(-ACTION_WIDTH - 24, next))
    })
    .onEnd((e) => {
      // Swipe franc vers la gauche → suppression directe.
      if (e.translationX < -ACTION_WIDTH * 1.4) {
        translateX.value = withSpring(-ACTION_WIDTH, { damping: 20 })
        opened.value = true
        runOnJS(triggerDelete)()
        return
      }
      const shouldOpen = translateX.value < -ACTION_WIDTH / 2
      translateX.value = withSpring(shouldOpen ? -ACTION_WIDTH : 0, { damping: 20 })
      opened.value = shouldOpen
    })

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }))

  return (
    <View style={styles.wrap}>
      {/* Action de suppression révélée sous la carte */}
      <View style={styles.actionLayer}>
        <Pressable
          style={styles.deleteBtn}
          onPress={() => {
            closeSwipe()
            triggerDelete()
          }}
          accessibilityLabel={`Supprimer ${name}`}
        >
          <Ionicons name="trash-outline" size={22} color="#FFFFFF" />
          <Text style={styles.deleteText}>Retirer</Text>
        </Pressable>
      </View>

      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.card, cardStyle]}>
          <Pressable onPress={() => onPress(analysisId)} style={styles.topRow}>
            {counts ? (
              <View style={styles.blobWrap}>
                <IngredientBlob counts={counts} variant="sm" width={56} />
              </View>
            ) : (
              <View style={styles.blobPlaceholder}>
                <Ionicons name="flask-outline" size={18} color={colors.inkLight} />
              </View>
            )}
            <Text style={styles.name} numberOfLines={2}>
              {name}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={colors.inkLight} />
          </Pressable>

          <View style={styles.freqRow}>
            {FREQ_OPTIONS.map((opt) => {
              const active = opt.value === frequency
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => {
                    if (!active) {
                      Haptics.selectionAsync().catch(() => {})
                      onFrequencyChange(itemId, opt.value)
                    }
                  }}
                  style={[styles.freqSeg, active && styles.freqSegActive]}
                >
                  <Text style={[styles.freqSegText, active && styles.freqSegTextActive]}>
                    {opt.label}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  )
})

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 6,
  },
  actionLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  deleteBtn: {
    width: ACTION_WIDTH,
    height: '100%',
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  deleteText: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 11,
    color: '#FFFFFF',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  blobWrap: { width: 56 },
  blobPlaceholder: {
    width: 56,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    flex: 1,
    fontFamily: fontFamilies.semiBold,
    fontSize: 14,
    color: colors.ink,
  },
  freqRow: {
    flexDirection: 'row',
    backgroundColor: colors.gray100,
    borderRadius: radius.full,
    padding: 3,
    gap: 3,
  },
  freqSeg: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: radius.full,
    alignItems: 'center',
  },
  freqSegActive: {
    backgroundColor: colors.accentSoft,
  },
  freqSegText: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 11,
    color: colors.inkMuted,
  },
  freqSegTextActive: {
    color: colors.accent,
  },
})
