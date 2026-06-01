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

import { ColorBadge } from '@/components/design/ColorBadge'
import { GlassCard } from '@/components/design/GlassCard'
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
  score,
  scoreLabel,
  rating,
  reduceMotion,
}) => {
  const pctSansPenalite = matched > 0 ? Math.round((counts.vert / matched) * 100) : null
  const tone = colors.rating[rating]

  return (
    <GlassCard padding={spacing.lg} contentStyle={styles.content}>
      <IngredientBlob counts={counts} variant="md" showCenter animate reduceMotion={reduceMotion} />

      {pctSansPenalite !== null ? (
        <Text style={styles.pct}>
          <Text style={styles.pctValue}>{pctSansPenalite} %</Text> sans pénalité
        </Text>
      ) : null}

      {/* Score /20 + libellé tonal */}
      <View style={styles.scoreRow}>
        <Text style={styles.scoreNumber}>
          <Text style={[styles.scoreBig, { color: tone.text }]}>{score.toFixed(1)}</Text>
          <Text style={styles.scoreOutOf}> /20</Text>
        </Text>
        <ColorBadge rating={rating} variant="chip" label={scoreLabel} size="md" />
      </View>

      <Text style={styles.ratio}>
        <Text style={styles.ratioStrong}>{matched}</Text> / {total} ingrédients reconnus
      </Text>
    </GlassCard>
  )
}

export const BigScoreCard = memo(BigScoreCardBase)

const styles = StyleSheet.create({
  content: {
    alignItems: 'center',
  },
  pct: {
    fontFamily: fontFamilies.regular,
    fontStyle: 'italic',
    fontSize: 13,
    color: colors.rating.vert.text,
    marginTop: spacing.sm,
  },
  pctValue: {
    fontFamily: fontFamilies.semiBold,
    fontStyle: 'normal',
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  scoreNumber: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  scoreBig: {
    fontFamily: fontFamilies.bold,
    fontSize: 32,
  },
  scoreOutOf: {
    fontFamily: fontFamilies.medium,
    fontSize: 16,
    color: colors.inkMuted,
  },
  ratio: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    color: colors.inkLight,
    marginTop: spacing.sm,
  },
  ratioStrong: {
    fontFamily: fontFamilies.semiBold,
    color: colors.ink,
  },
})
