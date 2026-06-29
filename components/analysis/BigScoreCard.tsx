/**
 * BigScoreCard — carte « score » centrale, port mobile du BigScoreCard web
 * (CosmetWiki AnalyseResultPanel.tsx).
 *
 * Compose le demi-donut IngredientBlob (centre = nombre d'ingrédients), le
 * score /20 + ColorBadge tonal, la ligne « X % sans pénalité » (en vert) et
 * le ratio « matched / total ingrédients reconnus ».
 *
 * Importe IngredientBlob et ColorBadge — ne réimplémente PAS la jauge.
 */

import { memo, type FC } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { WhiteCard } from '@/components/design/WhiteCard'
import { IngredientBlob, type BlobCounts } from '@/components/design/IngredientBlob'
import { colors } from '@/constants/colors'
import { fontFamilies } from '@/constants/typography'
import { spacing } from '@/constants/spacing'
import type { ColorRating } from '@/lib/analysis/types'

interface Props {
  counts: BlobCounts
  matched: number
  total: number
  score: number
  scoreLabel: string
  rating: ColorRating
  /** Désactive l'animation pop du blob (reduce-motion). */
  reduceMotion?: boolean
}

const BigScoreCardBase: FC<Props> = ({
  counts,
  matched,
  total,
  reduceMotion,
}) => {
  return (
    <WhiteCard padding={spacing.lg}>
      {/* Demi-donut centré (l'image produit est désormais en en-tête, à côté du titre). */}
      <View style={styles.donutSlot}>
        <IngredientBlob
          counts={counts}
          variant="md"
          width={160}
          animate
          reduceMotion={reduceMotion}
        />
        <Text style={styles.ratio}>
          <Text style={styles.ratioStrong}>{matched}</Text> / {total} ingrédients reconnus
        </Text>
      </View>
    </WhiteCard>
  )
}

export const BigScoreCard = memo(BigScoreCardBase)

const styles = StyleSheet.create({
  donutSlot: {
    alignItems: 'center',
  },
  ratio: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    color: colors.inkLight,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  ratioStrong: {
    fontFamily: fontFamilies.semiBold,
    color: colors.ink,
  },
})
