/**
 * ConclusionCard — carte bleu pastel avec la conclusion (twin mobile du web).
 * Rendue uniquement si la conclusion existe (l'Edge Function la rédige).
 */

import { type FC } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import { WhiteCard } from '@/components/design/WhiteCard'
import { colors } from '@/constants/colors'
import { spacing } from '@/constants/spacing'
import { fontFamilies } from '@/constants/typography'

const SKY_SOFT = '#F0F9FF'
const SKY_TEXT = '#0284C7'

export const ConclusionCard: FC<{ conclusion: string }> = ({ conclusion }) => {
  if (!conclusion) return null
  return (
    <WhiteCard padding={spacing.lg}>
      <View style={styles.header}>
        <View style={styles.iconCircle}>
          <Ionicons name="bulb-outline" size={16} color={SKY_TEXT} />
        </View>
        <Text style={styles.kicker}>CONCLUSION</Text>
      </View>
      <Text style={styles.body}>{conclusion}</Text>
    </WhiteCard>
  )
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: SKY_SOFT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kicker: { fontFamily: fontFamilies.semiBold, fontSize: 11, letterSpacing: 1, color: SKY_TEXT },
  body: { fontFamily: fontFamilies.regular, fontSize: 14, lineHeight: 21, color: colors.ink },
})
