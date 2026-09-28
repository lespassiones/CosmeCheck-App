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

import { memo, useState, type FC, type ReactNode } from 'react'
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
  /**
   * Contenu posé à DROITE du demi-donut (28/09/2026 : les 3 chiffres du
   * verdict, empilés). Sans lui, le demi-donut reste centré.
   */
  aside?: ReactNode
}

const BigScoreCardBase: FC<Props> = ({
  counts,
  matched,
  total,
  reduceMotion,
  aside,
}) => {
  // À côté du contenu de droite, le demi-donut prend ~60 % de la largeur utile :
  // il est ainsi au moins aussi haut que les 3 chiffres empilés (hauteur ≈ 0,54 ×
  // largeur), sans écraser la colonne de droite sur les petits écrans.
  const [rowWidth, setRowWidth] = useState(0)
  const donutWidth = aside
    ? rowWidth > 0
      ? Math.min(230, Math.round((rowWidth - SPLIT_GAP) * 0.6))
      : 190
    : 160
  const donut = (
    <View style={styles.donutSlot}>
      <IngredientBlob
        counts={counts}
        variant="md"
        width={donutWidth}
        animate
        reduceMotion={reduceMotion}
      />
      <Text style={styles.ratio}>
        <Text style={styles.ratioStrong}>{matched}</Text> / {total} ingrédients reconnus
      </Text>
    </View>
  )
  return (
    <WhiteCard padding={aside ? spacing.base : spacing.lg}>
      {aside ? (
        // Demi-donut à gauche, contenu à droite.
        <View style={styles.split} onLayout={(e) => setRowWidth(e.nativeEvent.layout.width)}>
          <View style={{ width: donutWidth }}>{donut}</View>
          <View style={styles.splitAside}>{aside}</View>
        </View>
      ) : (
        donut
      )}
    </WhiteCard>
  )
}

export const BigScoreCard = memo(BigScoreCardBase)

const SPLIT_GAP = 16

const styles = StyleSheet.create({
  donutSlot: {
    alignItems: 'center',
  },
  split: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPLIT_GAP,
  },
  splitAside: {
    flex: 1,
    minWidth: 0,
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
