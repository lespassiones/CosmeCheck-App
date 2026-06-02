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
import { Image, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import { WhiteCard } from '@/components/design/WhiteCard'
import { IngredientBlob, type BlobCounts } from '@/components/design/IngredientBlob'
import { colors } from '@/constants/colors'
import { fontFamilies } from '@/constants/typography'
import { radius, spacing } from '@/constants/spacing'
import type { ColorRating } from '@/lib/analysis/types'

interface Props {
  counts: BlobCounts
  matched: number
  total: number
  score: number
  scoreLabel: string
  rating: ColorRating
  /** URL de l'image produit (si disponible) — sinon un placeholder est affiché. */
  imageUrl?: string | null
  /** Désactive l'animation pop du blob (reduce-motion). */
  reduceMotion?: boolean
}

const BigScoreCardBase: FC<Props> = ({
  counts,
  matched,
  total,
  imageUrl,
  reduceMotion,
}) => {
  return (
    <WhiteCard padding={spacing.lg}>
      <View style={styles.row}>
        {/* Emplacement image produit (placeholder générique tant qu'on n'a pas d'URL) */}
        <View style={styles.imageSlot}>
          {imageUrl ? (
            <Image
              source={{ uri: imageUrl }}
              style={styles.image}
              resizeMode="cover"
              accessibilityIgnoresInvertColors
            />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Ionicons name="image-outline" size={28} color={colors.inkLight} />
            </View>
          )}
        </View>

        {/* Bloc droit : demi-donut + ratio */}
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
      </View>
    </WhiteCard>
  )
}

export const BigScoreCard = memo(BigScoreCardBase)

const IMAGE_SIZE = 110

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  imageSlot: {
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
    flexShrink: 0,
  },
  image: {
    width: '100%',
    height: '100%',
    borderRadius: radius.md,
    backgroundColor: colors.gray100,
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
    borderRadius: radius.md,
    backgroundColor: colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutSlot: {
    flex: 1,
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
