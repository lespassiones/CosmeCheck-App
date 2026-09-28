/**
 * SegmentedControl : sélecteur d'onglets en pilule (Historique : Analyses /
 * Favoris / Promesses).
 *
 * Rail gris clair bordé, segment actif = pilule encre foncée à texte blanc qui
 * GLISSE d'un segment à l'autre (timing, sans ressort ; ReduceMotion.System).
 * La pilule est positionnée d'après la largeur mesurée du rail (onLayout) :
 * avant la première mesure, elle n'est pas affichée (pas de saut au montage).
 */

import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'

import { colors } from '@/constants/colors'
import { radius } from '@/constants/spacing'
import { fontFamilies } from '@/constants/typography'
import { haptic } from '@/lib/haptics'

export interface Segment<K extends string> {
  key: K
  label: string
}

interface Props<K extends string> {
  segments: ReadonlyArray<Segment<K>>
  value: K
  onChange: (key: K) => void
}

const PAD = 3
const BORDER = 1
/** Largeur utile d'un segment : rail mesuré moins bordure et marge intérieure. */
const segmentWidth = (trackW: number, n: number) => (trackW - (PAD + BORDER) * 2) / n
const SLIDE = { duration: 240, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.System }

export function SegmentedControl<K extends string>({ segments, value, onChange }: Props<K>) {
  const [trackW, setTrackW] = useState(0)
  const index = Math.max(0, segments.findIndex((s) => s.key === value))
  const segW = trackW > 0 ? segmentWidth(trackW, segments.length) : 0

  const x = useSharedValue(0)
  useEffect(() => {
    if (segW > 0) x.value = withTiming(index * segW, SLIDE)
  }, [index, segW, x])

  const pillStyle = useAnimatedStyle(() => ({
    width: segW,
    transform: [{ translateX: x.value }],
  }))

  return (
    <View
      style={styles.track}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width
        if (w !== trackW) {
          // Première mesure : la pilule se pose directement, sans glisser.
          if (trackW === 0) x.value = index * segmentWidth(w, segments.length)
          setTrackW(w)
        }
      }}
      accessibilityRole="tablist"
    >
      {segW > 0 ? <Animated.View style={[styles.pill, pillStyle]} /> : null}
      {segments.map((s) => {
        const active = s.key === value
        return (
          <Pressable
            key={s.key}
            onPress={() => {
              if (active) return
              haptic.selection()
              onChange(s.key)
            }}
            style={styles.segment}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            hitSlop={4}
          >
            <Text
              style={[styles.label, active && styles.labelActive]}
              numberOfLines={1}
              allowFontScaling={false}
            >
              {s.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    height: 44,
    padding: PAD,
    borderRadius: radius.full,
    backgroundColor: colors.gray100,
    borderWidth: BORDER,
    borderColor: colors.border,
  },
  pill: {
    position: 'absolute',
    top: PAD,
    bottom: PAD,
    left: PAD,
    borderRadius: radius.full,
    backgroundColor: colors.ink,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: fontFamilies.medium,
    fontSize: 14,
    color: colors.ink,
  },
  labelActive: {
    fontFamily: fontFamilies.semiBold,
    color: colors.surface,
  },
})
