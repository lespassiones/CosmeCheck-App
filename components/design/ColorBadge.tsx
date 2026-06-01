/**
 * ColorBadge — badge de notation INCI (vert/jaune/orange/rouge).
 * Variantes : dot (point), chip (pilule, défaut), full (badge large + score).
 * Purement présentatif, mémoïsé.
 */

import { memo } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { colors } from '@/constants/colors'
import { fontFamilies } from '@/constants/typography'
import type { ColorRating } from '@/lib/analysis/types'

interface Props {
  rating: ColorRating
  variant?: 'dot' | 'chip' | 'full'
  label?: string
  score?: number
  size?: 'sm' | 'md' | 'lg'
}

const CHIP_LABEL: Record<ColorRating, string> = {
  vert: 'Vert',
  jaune: 'Jaune',
  orange: 'Orange',
  rouge: 'Rouge',
}

const FULL_LABEL: Record<ColorRating, string> = {
  vert: 'Excellent',
  jaune: 'Bon',
  orange: 'Acceptable',
  rouge: 'À améliorer',
}

const DOT_SIZE = { sm: 8, md: 10, lg: 12 } as const

const CHIP_PAD_H = { sm: 8, md: 10, lg: 12 } as const
const CHIP_PAD_V = { sm: 2, md: 3, lg: 4 } as const
const CHIP_FONT = { sm: 11, md: 12, lg: 13 } as const

const FULL_PAD_H = { sm: 12, md: 16, lg: 20 } as const
const FULL_PAD_V = { sm: 6, md: 8, lg: 10 } as const
const FULL_RADIUS = { sm: 12, md: 16, lg: 20 } as const
const FULL_SCORE_FONT = { sm: 18, md: 22, lg: 28 } as const

export const ColorBadge = memo(function ColorBadge({
  rating,
  variant = 'chip',
  label,
  score,
  size = 'md',
}: Props) {
  const tone = colors.rating[rating]

  if (variant === 'dot') {
    const s = DOT_SIZE[size]
    return (
      <View
        style={{
          width: s,
          height: s,
          borderRadius: s / 2,
          backgroundColor: tone.text,
        }}
      />
    )
  }

  if (variant === 'full') {
    return (
      <View
        style={{
          paddingHorizontal: FULL_PAD_H[size],
          paddingVertical: FULL_PAD_V[size],
          borderRadius: FULL_RADIUS[size],
          backgroundColor: tone.bg,
          alignItems: 'center',
        }}
      >
        {typeof score === 'number' && (
          <Text
            style={{
              fontFamily: fontFamilies.bold,
              fontSize: FULL_SCORE_FONT[size],
              color: tone.text,
            }}
          >
            {score}
            <Text style={{ fontSize: FULL_SCORE_FONT[size] * 0.5 }}>/20</Text>
          </Text>
        )}
        <Text style={{ fontFamily: fontFamilies.medium, fontSize: 12, color: tone.text }}>
          {label ?? FULL_LABEL[rating]}
        </Text>
      </View>
    )
  }

  // chip (default)
  return (
    <View
      style={{
        paddingHorizontal: CHIP_PAD_H[size],
        paddingVertical: CHIP_PAD_V[size],
        borderRadius: 9999,
        backgroundColor: tone.bg,
        alignSelf: 'flex-start',
      }}
    >
      <Text
        style={[
          styles.chipText,
          { fontSize: CHIP_FONT[size], color: tone.text },
        ]}
      >
        {label ?? CHIP_LABEL[rating]}
      </Text>
    </View>
  )
})

const styles = StyleSheet.create({
  chipText: {
    fontFamily: fontFamilies.semiBold,
  },
})
