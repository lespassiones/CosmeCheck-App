/**
 * AlternativesCarousel — recommandations « produits similaires » (présentationnel).
 *
 * Carrousel horizontal façon Yuka : image produit, nom, marque, pastille + label
 * (toujours la MÊME pastille que la recherche, via CatalogPastille). Le tap lance
 * l'analyse du produit ; « Voir tout » ouvre la page paginée.
 *
 * Composant « bête » : les données (produits filtrés restrictions/profil) et les
 * actions arrivent en props — la logique vit dans le conteneur (panel / page).
 */
import { type FC } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Image } from 'expo-image'
import { Ionicons } from '@expo/vector-icons'

import { colors } from '@/constants/colors'
import { radius, spacing } from '@/constants/spacing'
import { typography } from '@/constants/typography'
import { CatalogPastille } from '@/components/shared/CatalogPastille'
import type { AlternativeProduct } from '@/lib/analysis/alternativesFilter'
import { applyColorCap, scoreLabelFromScore } from '@/lib/analysis/scoreCap'

const CARD_W = 150

interface Props {
  products: AlternativeProduct[]
  isInitialLoading: boolean
  isEmpty: boolean
  analyzing: boolean
  showSeeAll: boolean
  onSelect: (product: AlternativeProduct) => void
  onSeeAll: () => void
}

const AltCard: FC<{
  product: AlternativeProduct
  disabled: boolean
  onPress: () => void
}> = ({ product, disabled, onPress }) => {
  // Plancher couleur : la note affichée = celle qu'on verra au clic (cohérence).
  const displayScore =
    product.score != null
      ? applyColorCap(product.score, product.countOrange, product.countRouge)
      : null
  const displayLabel =
    displayScore != null ? scoreLabelFromScore(displayScore) : product.scoreLabel
  return (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    style={({ pressed }) => [styles.card, pressed && !disabled && styles.cardPressed]}
    accessibilityRole="button"
    accessibilityLabel={`${product.name ?? 'Produit'}${product.brand ? `, ${product.brand}` : ''}`}
  >
    <View style={styles.imageWrap}>
      {product.imageUrl ? (
        <Image
          source={{ uri: product.imageUrl }}
          style={styles.image}
          contentFit="contain"
          cachePolicy="memory-disk"
          transition={120}
        />
      ) : (
        <Ionicons name="image-outline" size={28} color={colors.inkLight} />
      )}
    </View>
    <Text style={styles.name} numberOfLines={2}>
      {product.name ?? 'Produit'}
    </Text>
    {product.brand ? (
      <Text style={styles.brand} numberOfLines={1}>
        {product.brand}
      </Text>
    ) : null}
    <View style={styles.scoreRow}>
      <CatalogPastille score={displayScore} size={18} />
      {displayLabel ? (
        <Text style={styles.scoreLabel} numberOfLines={1}>
          {displayLabel}
        </Text>
      ) : null}
    </View>
  </Pressable>
  )
}

export const AlternativesCarousel: FC<Props> = ({
  products,
  isInitialLoading,
  isEmpty,
  analyzing,
  showSeeAll,
  onSelect,
  onSeeAll,
}) => {
  // Pas de match catalogue (ni produits, ni état vide explicite) → on n'affiche rien.
  if (!isInitialLoading && !isEmpty && products.length === 0) return null

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Alternatives</Text>
        {showSeeAll && products.length > 0 ? (
          <Pressable onPress={onSeeAll} hitSlop={8} accessibilityRole="button">
            <Text style={styles.seeAll}>Voir tout</Text>
          </Pressable>
        ) : null}
      </View>

      {isInitialLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.rose} />
        </View>
      ) : isEmpty ? (
        <Text style={styles.emptyText}>
          Aucune alternative sans tes restrictions dans cette catégorie pour le moment.
        </Text>
      ) : (
        <FlatList
          horizontal
          data={products}
          keyExtractor={(p) => p.ean}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <AltCard product={item} disabled={analyzing} onPress={() => onSelect(item)} />
          )}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { marginTop: spacing.lg, gap: spacing.sm },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xs,
  },
  title: { ...typography.h4, color: colors.ink },
  seeAll: { ...typography.smallSemiBold, color: colors.rating.vert.text },
  loading: { height: 140, alignItems: 'center', justifyContent: 'center' },
  emptyText: {
    ...typography.xs,
    color: colors.inkMuted,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.md,
  },
  listContent: { gap: spacing.md, paddingHorizontal: spacing.xs, paddingVertical: spacing.xs },
  card: {
    width: CARD_W,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    gap: 4,
  },
  cardPressed: { opacity: 0.7 },
  imageWrap: {
    height: 110,
    borderRadius: radius.md,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: 4,
  },
  image: { width: '100%', height: '100%' },
  name: { ...typography.smallSemiBold, color: colors.ink },
  brand: { ...typography.xs, color: colors.inkMuted },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  scoreLabel: { ...typography.xs, color: colors.inkMuted, flexShrink: 1 },
})
