/**
 * TagExposureBar — barre d'exposition cumulée pour une famille d'ingrédients.
 *
 * Port du web (CosmetWiki components/routine/TagExposureBar.tsx) : label +
 * compteur cumulé /j + barre proportionnelle multi-couleur. La barre est
 * remplie selon `count / max` (min 6 % comme le web) et segmentée par couleur
 * (vert/jaune/orange/rouge) via `colorSegments` (fractions). Animation de
 * remplissage au montage (reanimated, désactivable).
 */

import { memo, useEffect } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'

import { colors } from '@/constants/colors'
import { fontFamilies } from '@/constants/typography'

/** Couleurs des segments — alignées sur le web (COLOR_HEX). */
const COLOR_HEX: Record<string, string> = {
  Vert: '#10B981',
  Jaune: '#F59E0B',
  Orange: '#F97316',
  Rouge: '#F87171',
}

export interface TagColorSegment {
  color: string
  fraction: number
}

interface Props {
  label: string
  count: number
  max: number
  colorSegments?: TagColorSegment[]
  animate?: boolean
  index?: number
}

export const TagExposureBar = memo(function TagExposureBar({
  label,
  count,
  max,
  colorSegments = [],
  animate = true,
  index = 0,
}: Props) {
  // Remplissage cible : pourcentage de la piste (min 6 %, comme le web).
  const pct = Math.max(6, Math.round((count / Math.max(max, 0.0001)) * 100))

  const progress = useSharedValue(animate ? 0 : 1)
  useEffect(() => {
    if (!animate) {
      progress.value = 1
      return
    }
    progress.value = 0
    // Remplissage échelonné : chaque barre part un cran après la précédente.
    progress.value = withDelay(
      120 + Math.min(index, 10) * 70,
      withTiming(1, {
        duration: 600,
        easing: Easing.out(Easing.cubic),
        reduceMotion: ReduceMotion.System,
      }),
    )
  }, [animate, pct, index, progress])

  const fillStyle = useAnimatedStyle(() => ({
    width: `${pct * progress.value}%`,
  }))

  // Segments : si une seule couleur (ou aucune), une barre unie.
  const segments =
    colorSegments.length > 0
      ? colorSegments
      : [{ color: 'gris', fraction: 1 }]

  return (
    <View style={styles.row}>
      <View style={styles.labelRow}>
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
        <Text style={styles.count}>{count.toFixed(2)}/j</Text>
      </View>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, fillStyle]}>
          {segments.map((seg, i) => (
            <View
              key={`${seg.color}-${i}`}
              style={{
                flex: Math.max(seg.fraction, 0.0001),
                backgroundColor: COLOR_HEX[seg.color] ?? '#9CA3AF',
              }}
            />
          ))}
        </Animated.View>
      </View>
    </View>
  )
})

const styles = StyleSheet.create({
  row: { marginBottom: 10 },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  label: {
    flex: 1,
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    color: '#111111',
    marginRight: 8,
  },
  count: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    color: colors.inkMuted,
  },
  track: {
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.gray100,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 5,
    flexDirection: 'row',
    overflow: 'hidden',
  },
})
