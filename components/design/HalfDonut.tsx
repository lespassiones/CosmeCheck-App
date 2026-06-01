/**
 * HalfDonut — demi-camembert (180°) stroké, distinct de IngredientBlob.
 * Port du web (CosmetWiki components/features/HalfDonut.tsx) en react-native-svg.
 *
 * Visualise la répartition des ingrédients par couleur de score
 * (vert / jaune / orange / rouge) SANS note numérique — arcs stroké simples
 * sur une track grise, légende de pastilles + compteurs sous le donut.
 *
 * Palette HARD `colors.halfDonut` (distincte du blob organique).
 * Les angles vont de 180° (gauche) à 0° (droite) en sens horaire.
 */

import { memo } from 'react'
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import Svg, { Path } from 'react-native-svg'

import { colors } from '@/constants/colors'

type Props = {
  vert: number
  jaune: number
  orange: number
  rouge: number
  size?: number
  thickness?: number
  style?: StyleProp<ViewStyle>
}

const PALETTE = colors.halfDonut

export const HalfDonut = memo(function HalfDonut({
  vert,
  jaune,
  orange,
  rouge,
  size = 160,
  thickness = 18,
  style,
}: Props) {
  const total = vert + jaune + orange + rouge
  if (total <= 0) return null

  const cx = size / 2
  const cy = size / 2
  const r = (size - thickness) / 2

  const segments = [
    { value: vert, color: PALETTE.vert },
    { value: jaune, color: PALETTE.jaune },
    { value: orange, color: PALETTE.orange },
    { value: rouge, color: PALETTE.rouge },
  ]

  let acc = 0
  const arcs = segments
    .filter((s) => s.value > 0)
    .map((s, i) => {
      const start = (acc / total) * 180
      acc += s.value
      const end = (acc / total) * 180
      const startAngle = 180 - start
      const endAngle = 180 - end
      const x1 = cx + r * Math.cos((startAngle * Math.PI) / 180)
      const y1 = cy - r * Math.sin((startAngle * Math.PI) / 180)
      const x2 = cx + r * Math.cos((endAngle * Math.PI) / 180)
      const y2 = cy - r * Math.sin((endAngle * Math.PI) / 180)
      const large = end - start > 180 ? 1 : 0
      const d = `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`
      return { d, color: s.color, key: i }
    })

  const svgHeight = size / 2 + thickness / 2

  return (
    <View style={[styles.wrap, style]}>
      <Svg
        width={size}
        height={svgHeight}
        viewBox={`0 0 ${size} ${svgHeight}`}
      >
        {/* Track */}
        <Path
          d={`M ${thickness / 2} ${cy} A ${r} ${r} 0 0 1 ${size - thickness / 2} ${cy}`}
          fill="none"
          stroke={colors.gray100}
          strokeWidth={thickness}
          strokeLinecap="round"
        />
        {arcs.map((a) => (
          <Path
            key={a.key}
            d={a.d}
            fill="none"
            stroke={a.color}
            strokeWidth={thickness}
            strokeLinecap="butt"
          />
        ))}
      </Svg>
      <View style={styles.legend}>
        <Dot color={PALETTE.vert} count={vert} />
        <Dot color={PALETTE.jaune} count={jaune} />
        <Dot color={PALETTE.orange} count={orange} />
        <Dot color={PALETTE.rouge} count={rouge} />
      </View>
    </View>
  )
})

function Dot({ color, count }: { color: string; count: number }) {
  return (
    <View style={styles.dotWrap}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={styles.dotCount}>{count}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  legend: { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 12 },
  dotWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotCount: { fontSize: 11, fontWeight: '600', color: colors.ink },
})
