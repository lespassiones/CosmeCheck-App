/**
 * SkinGraph — courbe d'évolution du score de peau sur une période.
 *
 * Tout le calcul (filtrage période, extraction de la dimension, lissage
 * Catmull-Rom) est délégué à `lib/skin/graph.ts` : ce composant ne fait que
 * mesurer sa largeur (onLayout) et dessiner les chemins SVG. Les points issus
 * d'un SCAN visage sont marqués différemment (anneau creux) des check-ins.
 */

import { type FC, useState } from 'react'
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native'
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg'

import { colors } from '@/constants/colors'
import { spacing } from '@/constants/spacing'
import { fontFamilies } from '@/constants/typography'
import type { SkinDimension, SkinPoint } from '@/lib/skin/score'
import { filterByPeriod, seriesFor, toSmoothPath } from '@/lib/skin/graph'

interface Props {
  points: SkinPoint[]
  dim: 'global' | SkinDimension
  months: 3 | 6 | 12
  height?: number
}

const GRAD_ID = 'skinGraphArea'

export const SkinGraph: FC<Props> = ({ points, dim, months, height = 150 }) => {
  const [width, setWidth] = useState(0)

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width
    if (w > 0 && Math.abs(w - width) > 1) setWidth(w)
  }

  const filtered = filterByPeriod(points, months)
  const series = seriesFor(filtered, dim)
  const ready = width > 0 && series.length > 0
  const { path, areaPath, dots } = ready
    ? toSmoothPath(series, width, height)
    : { path: '', areaPath: '', dots: [] as Array<{ x: number; y: number }> }

  return (
    <View style={styles.wrap} onLayout={onLayout}>
      {series.length === 0 ? (
        <View style={[styles.empty, { height }]}>
          <Text style={styles.emptyText}>
            Pas encore de données sur cette période. Fais un bilan pour commencer.
          </Text>
        </View>
      ) : ready ? (
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id={GRAD_ID} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.rose} stopOpacity={0.22} />
              <Stop offset="1" stopColor={colors.rose} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          {areaPath ? <Path d={areaPath} fill={`url(#${GRAD_ID})`} /> : null}
          {path ? (
            <Path
              d={path}
              stroke={colors.rose}
              strokeWidth={2.5}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}
          {dots.map((d, i) => {
            const isScan = filtered[i]?.source === 'scan'
            return isScan ? (
              <Circle
                key={i}
                cx={d.x}
                cy={d.y}
                r={4.5}
                fill={colors.surface}
                stroke={colors.accent}
                strokeWidth={2}
              />
            ) : (
              <Circle key={i} cx={d.x} cy={d.y} r={3} fill={colors.rose} />
            )
          })}
        </Svg>
      ) : (
        <View style={{ height }} />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  empty: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.base },
  emptyText: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    color: colors.inkMuted,
    textAlign: 'center',
  },
})
