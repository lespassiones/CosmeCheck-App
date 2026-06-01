/**
 * IngredientProductRow — ligne "produit contenant cet ingrédient" dans la
 * colonne produits de la fiche ingrédient. Miroir mobile du <ProductRow> web
 * (CosmetWiki components/ProductRow.tsx) : vignette produit (image ou
 * placeholder), marque + nom, volume, et un point coloré (rating de
 * l'ingrédient courant). Tap → ouvre la source produit si dispo.
 */

import { memo, type FC } from 'react'
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import { colors } from '@/constants/colors'
import { fontFamilies } from '@/constants/typography'
import type { ColorRating } from '@/lib/analysis/types'
import type { IngredientProductHit } from './types'

interface Props {
  product: IngredientProductHit
  rating: ColorRating | null
}

const IngredientProductRowBase: FC<Props> = ({ product, rating }) => {
  const dotColor = rating ? colors.rating[rating].DEFAULT : colors.border
  const url = product.source_url
  const hasUrl = !!url

  return (
    <Pressable
      onPress={() => {
        if (url) Linking.openURL(url).catch(() => {})
      }}
      disabled={!hasUrl}
      accessibilityRole={hasUrl ? 'link' : undefined}
      accessibilityLabel={`${product.brand} ${product.name}`}
      style={({ pressed }) => [styles.row, pressed && hasUrl && styles.rowPressed]}
    >
      <View style={styles.thumb}>
        {product.image_url ? (
          <Image source={{ uri: product.image_url }} style={styles.thumbImg} resizeMode="cover" />
        ) : (
          <Ionicons name="cube-outline" size={18} color={colors.inkLight} />
        )}
      </View>

      <View style={styles.info}>
        <Text style={styles.brand} numberOfLines={1}>
          {product.brand}
        </Text>
        <Text style={styles.name} numberOfLines={2}>
          {product.name}
        </Text>
        {product.volume ? (
          <Text style={styles.volume} numberOfLines={1}>
            {product.volume}
          </Text>
        ) : null}
      </View>

      <View style={[styles.dot, { backgroundColor: dotColor }]} />
    </Pressable>
  )
}

export const IngredientProductRow = memo(IngredientProductRowBase)

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderWidth: 1,
    borderColor: colors.glass.border,
  },
  rowPressed: {
    opacity: 0.7,
  },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbImg: {
    width: '100%',
    height: '100%',
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  brand: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 11,
    color: colors.inkMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  name: {
    fontFamily: fontFamilies.medium,
    fontSize: 13,
    color: colors.ink,
    marginTop: 1,
  },
  volume: {
    fontFamily: fontFamilies.regular,
    fontSize: 11,
    color: colors.inkLight,
    marginTop: 2,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
})
