/**
 * IngredientBlob — demi-donut de distribution d'ingrédients (vert/jaune/orange/rouge),
 * porté du web (CosmetWiki components/blob/IngredientBlob.tsx) en react-native-svg.
 *
 * Géométries (lg/md/sm) IDENTIQUES au web, couleurs depuis les tokens
 * (colors.blob / colors.blobShadow / colors.blobText), bords radiaux ondulés +
 * gaps + contour arrondi (effet « blob »).
 *
 * Le web applique deux styles d'ombre :
 *  - défaut : une « claymorphism » drop-shadow grise sur tout le groupe.
 *  - neumorphic : chaque tranche projette une ombre dans SA propre couleur
 *    (vert→vert, jaune→jaune…) via un filtre <FeDropShadow> par tranche, plus
 *    un highlight blanc global vers le haut-gauche. react-native-svg 15 supporte
 *    <Filter>/<FeDropShadow>, on reproduit donc fidèlement l'effet.
 *
 * Animation blob-pop optionnelle (motion.ts) : scale 0.55→1 avec overshoot +
 * fade au montage. Respecte reduce-motion via le flag passé par le caller (ou
 * AccessibilityInfo en interne).
 */

import { memo, useEffect } from 'react'
import {
  AccessibilityInfo,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import Svg, {
  Defs,
  FeDropShadow,
  Filter,
  G,
  Path,
  Text as SvgText,
} from 'react-native-svg'

import { colors } from '@/constants/colors'
import { timingFor } from '@/constants/motion'
import {
  ringSectorPath,
  straightRadialEdge,
  wavyRadialEdge,
  type Pt,
} from '@/lib/blob/path'

export type BlobCounts = {
  vert: number
  jaune: number
  orange: number
  rouge: number
}

type Variant = 'lg' | 'md' | 'sm'
type ColorKey = keyof BlobCounts

/** Les quatre couleurs vivent dans le demi-anneau (aucune forme détachée). */
const ARC_ORDER: ReadonlyArray<ColorKey> = ['vert', 'jaune', 'orange', 'rouge']

const BLOB_COLORS = colors.blob
const BLOB_SHADOW = colors.blobShadow
const BLOB_TEXT = colors.blobText

const BLOB_LABEL: Record<ColorKey, string> = {
  vert: 'sans pénalité',
  jaune: 'pénalité faible',
  orange: 'pénalité moyenne',
  rouge: 'pénalité forte',
}

const SEEDS: Record<ColorKey, number> = { vert: 8721, jaune: 4193, orange: 6504, rouge: 2876 }
/** Seeds stables par *jonction* (entre deux couleurs adjacentes). */
const JUNCTION_SEEDS = [10133, 24517, 38981]

type Geom = {
  width: number
  height: number
  cx: number
  cy: number
  rOuter: number
  rInner: number
  jitter: number
  edgeSegments: number
  roundStroke: number
  gapAngle: number
}

const GEOMETRY: Record<Variant, Geom> = {
  lg: { width: 520, height: 290, cx: 240, cy: 240, rOuter: 220, rInner: 90, jitter: 0.07, edgeSegments: 16, roundStroke: 18, gapAngle: 0.11 },
  md: { width: 280, height: 152, cx: 128, cy: 124, rOuter: 116, rInner: 46, jitter: 0.06, edgeSegments: 12, roundStroke: 9, gapAngle: 0.1 },
  sm: { width: 64, height: 38, cx: 28, cy: 32, rOuter: 28, rInner: 12, jitter: 0.04, edgeSegments: 8, roundStroke: 3, gapAngle: 0.1 },
}

/**
 * Offset + flou (en unités viewBox) de l'ombre colorée par tranche pour la
 * variante neumorphique. Identique au web (NEU_SLICE_SHADOW).
 */
const NEU_SLICE_SHADOW: Record<Variant, { dx: number; dy: number; blur: number }> = {
  lg: { dx: 3, dy: 9, blur: 13 },
  md: { dx: 1.5, dy: 5, blur: 7 },
  sm: { dx: 0.5, dy: 1.8, blur: 2.5 },
}

const DEFAULT_WIDTH: Record<Variant, number> = { lg: 320, md: 140, sm: 64 }

function computeSlices(counts: BlobCounts): { color: ColorKey; start: number; end: number }[] {
  const total = counts.vert + counts.jaune + counts.orange + counts.rouge
  const minAngle = Math.PI * 0.04

  let raw: { color: ColorKey; angle: number }[]
  if (total === 0) {
    const equal = Math.PI / ARC_ORDER.length
    raw = ARC_ORDER.map((c) => ({ color: c, angle: equal }))
  } else {
    const present = ARC_ORDER.filter((c) => counts[c] > 0)
    raw = present.map((c) => ({ color: c, angle: (counts[c] / total) * Math.PI }))
    const small = raw.filter((s) => s.angle < minAngle)
    if (small.length > 0 && small.length < raw.length) {
      const reserved = small.length * minAngle
      const bigSum = raw.filter((s) => s.angle >= minAngle).reduce((a, b) => a + b.angle, 0)
      const remain = Math.PI - reserved
      raw = raw.map((s) =>
        s.angle < minAngle
          ? { ...s, angle: minAngle }
          : { ...s, angle: (s.angle / bigSum) * remain },
      )
    }
  }

  let cursor = -Math.PI
  return raw.map((s) => {
    const start = cursor
    cursor += s.angle
    return { color: s.color, start, end: cursor }
  })
}

interface Props {
  counts: BlobCounts
  variant?: Variant
  width?: number
  showCenter?: boolean
  showLegend?: boolean
  /** Ombres colorées par tranche (claymorphism « extrudée » de la surface neu). */
  neumorphic?: boolean
  /** Joue l'animation pop-in au montage (scale + fade + overshoot). */
  animate?: boolean
  /** Force reduce-motion (sinon lu via AccessibilityInfo). */
  reduceMotion?: boolean
  style?: StyleProp<ViewStyle>
}

const AnimatedSvg = Animated.createAnimatedComponent(Svg)

export const IngredientBlob = memo(function IngredientBlob({
  counts,
  variant = 'md',
  width,
  showCenter = false,
  showLegend = false,
  neumorphic = false,
  animate = false,
  reduceMotion,
  style,
}: Props) {
  const geom = GEOMETRY[variant]
  const neuSlice = NEU_SLICE_SHADOW[variant]
  const total = counts.vert + counts.jaune + counts.orange + counts.rouge
  const slices = computeSlices(counts)

  // Gap inter-tranche : chaque jonction interne perd `gapAngle` au total,
  // moitié de chaque côté. Les extrémités du demi-anneau restent sur la base.
  const half = geom.gapAngle / 2
  const gapped = slices.map((s, i) => ({
    color: s.color,
    start: i === 0 ? s.start : s.start + half,
    end: i === slices.length - 1 ? s.end : s.end - half,
  }))

  const paths = gapped.map((s, i) => {
    const isFirst = i === 0
    const isLast = i === gapped.length - 1
    const leftEdge: Pt[] = isFirst
      ? straightRadialEdge(geom.cx, geom.cy, geom.rInner, geom.rOuter, s.start, geom.edgeSegments)
      : wavyRadialEdge(geom.cx, geom.cy, geom.rInner, geom.rOuter, s.start, JUNCTION_SEEDS[i - 1] ?? SEEDS[s.color], geom.jitter, geom.edgeSegments)
    const rightEdge: Pt[] = isLast
      ? straightRadialEdge(geom.cx, geom.cy, geom.rInner, geom.rOuter, s.end, geom.edgeSegments)
      : wavyRadialEdge(geom.cx, geom.cy, geom.rInner, geom.rOuter, s.end, JUNCTION_SEEDS[i] ?? SEEDS[s.color], geom.jitter, geom.edgeSegments)
    return { color: s.color, d: ringSectorPath(geom.rInner, geom.rOuter, leftEdge, rightEdge) }
  })

  const w = width ?? DEFAULT_WIDTH[variant]
  const h = (w * geom.height) / geom.width
  const centerY = geom.cy - geom.rInner * 0.55

  // ── Animation blob-pop (scale + fade overshoot) ──────────────────────────
  const progress = useSharedValue(animate ? 0 : 1)
  useEffect(() => {
    if (!animate) {
      progress.value = 1
      return
    }
    let cancelled = false
    const run = (rm: boolean) => {
      if (cancelled) return
      progress.value = 0
      progress.value = withTiming(1, timingFor('blobPop', rm))
    }
    if (typeof reduceMotion === 'boolean') {
      run(reduceMotion)
    } else {
      AccessibilityInfo.isReduceMotionEnabled()
        .then((rm) => run(rm))
        .catch(() => run(false))
    }
    return () => {
      cancelled = true
    }
  }, [animate, reduceMotion, progress])

  const animStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.55 + 0.45 * progress.value }],
  }))

  return (
    <View style={[{ alignItems: 'center', width: '100%' }, style]}>
      <Animated.View style={[{ alignItems: 'center' }, animate ? animStyle : null]}>
        <AnimatedSvg width={w} height={h} viewBox={`0 0 ${geom.width} ${geom.height}`}>
          {neumorphic && (
            <Defs>
              {ARC_ORDER.map((c) => (
                <Filter
                  key={`f-${c}`}
                  id={`neu-${variant}-${c}`}
                  x="-50%"
                  y="-50%"
                  width="200%"
                  height="200%"
                >
                  <FeDropShadow
                    dx={neuSlice.dx}
                    dy={neuSlice.dy}
                    stdDeviation={neuSlice.blur / 2}
                    floodColor={BLOB_SHADOW[c]}
                  />
                </Filter>
              ))}
            </Defs>
          )}
          <G>
            {paths.map((p) => (
              <Path
                key={p.color}
                d={p.d}
                fill={BLOB_COLORS[p.color]}
                stroke={BLOB_COLORS[p.color]}
                strokeWidth={geom.roundStroke}
                strokeLinejoin="round"
                strokeLinecap="round"
                filter={neumorphic ? `url(#neu-${variant}-${p.color})` : undefined}
              />
            ))}
          </G>
          {showCenter && (
            <>
              <SvgText
                x={geom.cx}
                y={centerY}
                textAnchor="middle"
                fontSize={variant === 'lg' ? 56 : 28}
                fontWeight="700"
                fill={colors.ink}
              >
                {String(total)}
              </SvgText>
              <SvgText
                x={geom.cx}
                y={centerY + (variant === 'lg' ? 30 : 18)}
                textAnchor="middle"
                fontSize={variant === 'lg' ? 16 : 11}
                fill={colors.inkMuted}
              >
                ingrédients
              </SvgText>
            </>
          )}
        </AnimatedSvg>
      </Animated.View>

      {showLegend && (
        <View style={styles.legend}>
          {ARC_ORDER.map((color) => (
            <View key={color} style={styles.legendItem}>
              <View style={[styles.swatch, { backgroundColor: BLOB_COLORS[color] }]} />
              <Text style={[styles.legendCount, { color: BLOB_TEXT[color] }]}>
                {counts[color]}
                <Text style={{ color: colors.inkLight }}>/{total}</Text>
              </Text>
              <Text style={[styles.legendLabel, { color: BLOB_TEXT[color] }]}>{BLOB_LABEL[color]}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  )
})

const styles = StyleSheet.create({
  legend: { marginTop: 8, flexDirection: 'row', width: '100%', justifyContent: 'space-around' },
  legendItem: { alignItems: 'center', flex: 1 },
  swatch: { width: 28, height: 16, borderRadius: 8 },
  legendCount: { marginTop: 4, fontSize: 15, fontWeight: '700' },
  legendLabel: { fontSize: 10, fontStyle: 'italic', textAlign: 'center' },
})
