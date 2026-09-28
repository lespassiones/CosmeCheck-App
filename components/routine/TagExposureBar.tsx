/**
 * TagExposureBar : barre d'exposition cumulée pour une famille d'ingrédients.
 *
 * Nom de la famille au-dessus, puis la barre avec « 1,5 par jour » à sa
 * droite. La barre est remplie selon `count / max` (min 6 %) et
 * découpée par couleur (vert, jaune, orange, rouge) via `colorSegments`
 * (fractions), chaque couleur séparée par un fin trait blanc. Remplissage
 * animé au montage (reanimated, désactivable, respecte reduce-motion).
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

/** Couleurs des segments : teintes pleines et douces, lisibles côte à côte. */
const COLOR_HEX: Record<string, string> = {
  Vert: '#3FA46A',
  Jaune: '#EFC048',
  Orange: '#EE8A3E',
  Rouge: '#E0555A',
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

/** 1.5 → « 1,5 par jour », 2 → « 2 par jour ». */
function perDay(count: number): string {
  const rounded = Math.round(count * 10) / 10
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace('.', ',')
  return `${text} par jour`
}

export const TagExposureBar = memo(function TagExposureBar({
  label,
  count,
  max,
  colorSegments = [],
  animate = true,
  index = 0,
}: Props) {
  // Remplissage cible : pourcentage de la piste (min 6 %).
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
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`${label} : ${perDay(count)}`}
    >
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.barRow}>
        <View style={styles.track}>
          <Animated.View style={[styles.fill, fillStyle]}>
            {segments.map((seg, i) => (
              <View
                key={`${seg.color}-${i}`}
                style={{
                  flex: Math.max(seg.fraction, 0.0001),
                  backgroundColor: COLOR_HEX[seg.color] ?? colors.inkLight,
                }}
              />
            ))}
          </Animated.View>
        </View>
        <Text style={styles.count} numberOfLines={1}>
          {perDay(count)}
        </Text>
      </View>
    </View>
  )
})

const BAR_H = 12

const styles = StyleSheet.create({
  row: {
    paddingVertical: 7,
    gap: 6,
  },
  label: {
    fontFamily: fontFamilies.medium,
    fontSize: 13.5,
    lineHeight: 18,
    color: colors.ink,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  track: {
    flex: 1,
    height: BAR_H,
    borderRadius: BAR_H / 2,
    backgroundColor: colors.gray100,
    overflow: 'hidden',
  },
  // Fond blanc + écart de 2 px entre segments = fin trait blanc entre couleurs.
  fill: {
    height: '100%',
    borderRadius: BAR_H / 2,
    flexDirection: 'row',
    gap: 2,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  count: {
    minWidth: 74,
    textAlign: 'right',
    fontFamily: fontFamilies.regular,
    fontSize: 12.5,
    color: colors.inkMuted,
  },
})
