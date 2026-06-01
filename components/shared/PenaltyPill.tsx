/**
 * PenaltyPill — pilule compacte « X % {label} » avec une icône feuille.
 *
 * Réplique exacte du composant `PenaltyPill` du web (HomeDashboard.tsx) :
 *   <Leaf/> <strong>{pct} %</strong> <em>{label}</em>
 * posé sur un fond teinté arrondi (rounded-md), 4 tons possibles.
 *
 * Tons (texte / fond), repris des classes Tailwind du web :
 *   - emerald : #16A34A sur #ECFDF5  (emerald-700 / emerald-50)
 *   - amber   : #CA8A04 sur #FEFCE8  (amber-700 / amber-50)
 *   - orange  : #EA580C sur #FFF7ED  (orange-700 / orange-50)
 *   - rose    : #E11D48 sur #FFF1F2  (rose-700 / rose-50)
 *
 * Interface :
 *   { pct: number; label: string; tone: 'emerald' | 'amber' | 'orange' | 'rose'; size?: 'sm' | 'md' }
 */

import type { FC } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import { radius } from '@/constants/spacing'
import { fontFamilies } from '@/constants/typography'

export type PenaltyTone = 'emerald' | 'amber' | 'orange' | 'rose'

interface Props {
  pct: number
  label: string
  tone: PenaltyTone
  size?: 'sm' | 'md'
}

const TONE: Record<PenaltyTone, { fg: string; bg: string }> = {
  emerald: { fg: '#16A34A', bg: '#ECFDF5' },
  amber: { fg: '#CA8A04', bg: '#FEFCE8' },
  orange: { fg: '#EA580C', bg: '#FFF7ED' },
  rose: { fg: '#E11D48', bg: '#FFF1F2' },
}

export const PenaltyPill: FC<Props> = ({ pct, label, tone, size = 'md' }) => {
  const { fg, bg } = TONE[tone]
  const isSm = size === 'sm'

  return (
    <View
      style={[
        styles.pill,
        {
          backgroundColor: bg,
          paddingHorizontal: isSm ? 6 : 8,
          paddingVertical: isSm ? 1 : 2,
          gap: isSm ? 2 : 4,
        },
      ]}
    >
      <Ionicons name="leaf" size={isSm ? 10 : 12} color={fg} />
      <Text
        allowFontScaling={false}
        style={[styles.pct, { color: fg, fontSize: isSm ? 10 : 12 }]}
      >
        {pct} %
      </Text>
      <Text
        allowFontScaling={false}
        style={[styles.label, { color: fg, fontSize: isSm ? 10 : 12 }]}
      >
        {label}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radius.md,
  },
  pct: {
    fontFamily: fontFamilies.semiBold,
    letterSpacing: -0.1,
  },
  label: {
    fontFamily: fontFamilies.regular,
    fontStyle: 'italic',
  },
})
