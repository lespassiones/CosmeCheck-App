/**
 * ProductMiniCard — carte produit compacte (image bord à bord, marque, nom, pastille +
 * libellé). Extraite telle quelle de l'AltCard d'AlternativesCarousel pour être
 * réutilisée par les Pépites de la semaine (et rester l'unique rendu de carte
 * produit du catalogue). JAMAIS de note chiffrée : pastille + label seulement.
 */
import { type FC } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Image } from 'expo-image'
import { Ionicons } from '@expo/vector-icons'

import { colors } from '@/constants/colors'
import { radius, spacing } from '@/constants/spacing'
import { typography } from '@/constants/typography'
import { CatalogPastille } from '@/components/shared/CatalogPastille'
import { HapticPressable as Pressable } from '@/components/shared/HapticPressable'
import type { AlternativeProduct } from '@/lib/analysis/alternativesFilter'
import { applyColorCap, scoreLabelFromScore } from '@/lib/analysis/scoreCap'

interface Props {
  product: AlternativeProduct
  disabled?: boolean
  onPress: () => void
  /** Largeur de la carte (défaut 150). */
  width?: number
}

export const ProductMiniCard: FC<Props> = ({ product, disabled = false, onPress, width = 150 }) => {
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
      style={({ pressed }) => [styles.card, { width }, pressed && !disabled && styles.cardPressed]}
      accessibilityRole="button"
      accessibilityLabel={`${product.name ?? 'Produit'}${product.brand ? `, ${product.brand}` : ''}`}
    >
      {/* Photo bord à bord (cover) : aucune bande blanche ajoutée par le cadrage. */}
      <View style={styles.imageWrap}>
        {product.imageUrl ? (
          <Image
            source={{ uri: product.imageUrl }}
            style={styles.image}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={120}
          />
        ) : (
          <Ionicons name="image-outline" size={28} color={colors.inkLight} />
        )}
      </View>
      <View style={styles.body}>
        {product.brand ? (
          <Text style={styles.brand} numberOfLines={1}>
            {product.brand}
          </Text>
        ) : null}
        <Text style={styles.name} numberOfLines={2}>
          {product.name ?? 'Produit'}
        </Text>
        <View style={styles.scoreRow}>
          <CatalogPastille score={displayScore} size={18} />
          {displayLabel ? (
            <Text style={styles.scoreLabel} numberOfLines={1}>
              {displayLabel}
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  cardPressed: { opacity: 0.7 },
  imageWrap: {
    height: 120,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: { width: '100%', height: '100%' },
  body: { padding: spacing.sm, gap: 4 },
  name: { ...typography.smallSemiBold, color: colors.ink },
  brand: { ...typography.xs, color: colors.inkMuted },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  scoreLabel: { ...typography.xs, color: colors.inkMuted, flexShrink: 1 },
})
