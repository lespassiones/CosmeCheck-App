/**
 * RoutineMiniDonut — petit donut PLEIN (cercle avec trou) montrant la
 * répartition des ingrédients vert / jaune / orange / rouge d'un produit.
 *
 * Remplace la poignée « burger » sur les cartes de routine : plus épuré et
 * informatif. Rendu via 4 arcs stroke-dasharray sur des cercles concentriques
 * (léger gap entre segments). Aucun texte, aucune note chiffrée.
 */

import { memo } from 'react'
import { View } from 'react-native'
import Svg, { Circle, G } from 'react-native-svg'

import { colors } from '@/constants/colors'
import type { BlobCounts } from '@/components/design/IngredientBlob'

interface Props {
  counts: BlobCounts | null
  size?: number
}

type Key = keyof BlobCounts
const ORDER: readonly Key[] = ['vert', 'jaune', 'orange', 'rouge']

export const RoutineMiniDonut = memo(function RoutineMiniDonut({ counts, size = 30 }: Props) {
  const stroke = Math.max(3, Math.round(size * 0.16))
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const total = counts ? counts.vert + counts.jaune + counts.orange + counts.rouge : 0

  // Segments proportionnels ; petit gap visuel entre couleurs présentes.
  const present = counts ? ORDER.filter((k) => counts[k] > 0) : []
  const gap = present.length > 1 ? c * 0.02 : 0

  let offset = 0
  const segments =
    counts && total > 0
      ? present.map((k) => {
          const frac = counts[k] / total
          const len = Math.max(0, frac * c - gap)
          const seg = { key: k, color: colors.blob[k], dash: len, rotationOffset: offset }
          offset += frac * c
          return seg
        })
      : []

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Piste de fond (gris clair) */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.gray100}
          strokeWidth={stroke}
          fill="none"
        />
        {/* Rotation -90° pour démarrer en haut */}
        <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
          {segments.map((s) => (
            <Circle
              key={s.key}
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke={s.color}
              strokeWidth={stroke}
              strokeLinecap="butt"
              fill="none"
              strokeDasharray={`${s.dash} ${c - s.dash}`}
              strokeDashoffset={-s.rotationOffset}
            />
          ))}
        </G>
      </Svg>
    </View>
  )
})
