/**
 * DeltaChip — pastille de variation hebdomadaire du score de peau.
 *
 *   delta > 0  : "+N cette semaine" (vert)
 *   delta < 0  : "N cette semaine"  (ambre, le signe "-" est déjà dans le nombre)
 *   delta = 0  : "Stable cette semaine" (neutre)
 *   delta null : rien (pas encore de comparaison possible)
 */

import { type FC } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { colors } from '@/constants/colors'
import { radius, spacing } from '@/constants/spacing'
import { fontFamilies } from '@/constants/typography'

interface Props {
  delta: number | null
}

export const DeltaChip: FC<Props> = ({ delta }) => {
  if (delta === null || !Number.isFinite(delta)) return null

  let bg: string = colors.gray100
  let fg: string = colors.gray600
  let label: string

  if (delta > 0) {
    bg = colors.rating.vert.bg
    fg = colors.rating.vert.text
    label = `+${delta} cette semaine`
  } else if (delta < 0) {
    bg = colors.rating.jaune.bg
    fg = colors.rating.jaune.text
    label = `${delta} cette semaine`
  } else {
    label = 'Stable cette semaine'
  }

  return (
    <View style={[styles.chip, { backgroundColor: bg }]}>
      <Text style={[styles.text, { color: fg }]}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.full,
  },
  text: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 12,
  },
})
