/**
 * FrequencySelect — contrôle segmenté de fréquence (Quotidien / Hebdo /
 * Mensuel), pleine largeur (28/09/2026, remplace la pilule + feuille).
 *
 * Les 3 options sont visibles d'un coup : l'active est une pilule NOIRE à
 * texte blanc qui glisse d'un segment à l'autre (timing, pas de ressort) ;
 * un filet fin sépare deux options inactives voisines.
 */

import { memo, useCallback, useEffect, useState } from 'react'
import { type LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'

import { colors } from '@/constants/colors'
import { radius } from '@/constants/spacing'
import { fontFamilies } from '@/constants/typography'
import type { RoutineFrequency } from '@/lib/supabase/types'

const FREQ_OPTIONS: { value: RoutineFrequency; label: string }[] = [
  { value: 'daily', label: 'Quotidien' },
  { value: 'weekly', label: 'Hebdo' },
  { value: 'monthly', label: 'Mensuel' },
]

const HEIGHT = 46

interface Props {
  value: RoutineFrequency
  onChange: (value: RoutineFrequency) => void
}

export const FrequencySelect = memo(function FrequencySelect({ value, onChange }: Props) {
  const [width, setWidth] = useState(0)
  const segW = width / FREQ_OPTIONS.length
  const activeIndex = Math.max(0, FREQ_OPTIONS.findIndex((o) => o.value === value))

  // Position de la pilule noire (en px) ; posée sans animation à la 1re mesure.
  const x = useSharedValue(0)
  useEffect(() => {
    if (!segW) return
    x.value = withTiming(activeIndex * segW, {
      duration: 220,
      easing: Easing.out(Easing.cubic),
      reduceMotion: ReduceMotion.System,
    })
  }, [activeIndex, segW, x])

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const w = e.nativeEvent.layout.width
      if (!width) x.value = activeIndex * (w / FREQ_OPTIONS.length)
      setWidth(w)
    },
    [width, activeIndex, x],
  )

  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }))

  const select = useCallback(
    (next: RoutineFrequency) => {
      if (next === value) return
      Haptics.selectionAsync().catch(() => {})
      onChange(next)
    },
    [value, onChange],
  )

  return (
    <View style={styles.track} onLayout={onLayout}>
      {segW > 0 ? <Animated.View style={[styles.thumb, { width: segW }, thumbStyle]} /> : null}

      {FREQ_OPTIONS.map((opt, i) => {
        const active = i === activeIndex
        // Filet entre deux options inactives voisines (jamais contre la pilule).
        const showDivider =
          i < FREQ_OPTIONS.length - 1 && i !== activeIndex && i + 1 !== activeIndex
        return (
          <Pressable
            key={opt.value}
            onPress={() => select(opt.value)}
            style={styles.segment}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`Fréquence : ${opt.label}`}
          >
            <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
              {opt.label}
            </Text>
            {showDivider ? <View style={styles.divider} /> : null}
          </Pressable>
        )
      })}
    </View>
  )
})

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    height: HEIGHT,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.gray50,
    overflow: 'hidden',
  },
  // Pilule active : couvre toute la hauteur du segment, bords compris.
  thumb: {
    position: 'absolute',
    top: -1,
    bottom: -1,
    left: -1,
    borderRadius: radius.full,
    backgroundColor: colors.gray900,
  },
  segment: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: fontFamilies.medium, fontSize: 14, color: colors.ink },
  labelActive: { color: '#FFFFFF' },
  divider: {
    position: 'absolute',
    right: 0,
    top: '25%',
    bottom: '25%',
    width: StyleSheet.hairlineWidth,
    backgroundColor: colors.gray300,
  },
})
