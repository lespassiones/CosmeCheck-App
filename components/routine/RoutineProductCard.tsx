/**
 * RoutineProductCard — carte produit ÉPURÉE (refonte juil 2026).
 *
 * Ne montre plus QUE : photo produit verticale à gauche + nom + marque, et le
 * donut de proportions couleur en bas à droite. Toute l'édition (fréquence,
 * créneau matin/soir, déplacement de bloc, suppression, voir l'analyse) a été
 * déplacée sur la sous-page de l'item (app/routine/item/[id].tsx), atteinte au
 * tap sur la carte. Le drag (réorganisation) reste géré par RoutineSection via
 * un appui long.
 *
 * Aucune note produit chiffrée (règle éditoriale) : le donut seul.
 */

import { memo } from 'react'
import { StyleSheet, Text, View, Pressable } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'

import { colors } from '@/constants/colors'
import { spacing, radius } from '@/constants/spacing'
import { fontFamilies } from '@/constants/typography'
import type { BlobCounts } from '@/components/design/IngredientBlob'
import { useProductImage } from '@/hooks/useProductImage'
import { RoutineMiniDonut } from '@/components/routine/RoutineMiniDonut'

/** Hauteur FIXE de la carte + écart vertical : base du calcul d'index du drag. */
export const ROUTINE_CARD_HEIGHT = 100
export const ROUTINE_CARD_GAP = 12
export const ROUTINE_CARD_STEP = ROUTINE_CARD_HEIGHT + ROUTINE_CARD_GAP

interface Props {
  itemId: string
  analysisId: string
  displayIndex: number
  name: string
  brand: string | null
  ean: string | null
  fallbackImageUrl?: string | null
  counts: BlobCounts | null
  /** Tap sur la carte -> sous-page de l'item (id = routine_items.id). */
  onPress: (itemId: string) => void
  /** Affiche le badge numéro d'ordre (routine soin uniquement). */
  showIndex?: boolean
}

export const RoutineProductCard = memo(function RoutineProductCard({
  itemId,
  analysisId,
  displayIndex,
  name,
  brand,
  ean,
  fallbackImageUrl,
  counts,
  onPress,
  showIndex = false,
}: Props) {
  const imageUrl = useProductImage(analysisId, ean, fallbackImageUrl)

  return (
    <Pressable
      style={styles.card}
      onPress={() => onPress(itemId)}
      accessibilityRole="button"
      accessibilityLabel={`Ouvrir ${name}`}
    >
      {/* ── Visuel produit (gauche, pleine hauteur) ── */}
      <View style={styles.visualWrap}>
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={styles.productImage}
            contentFit="contain"
            cachePolicy="memory-disk"
            transition={120}
          />
        ) : (
          <View style={styles.visualPlaceholder}>
            <Ionicons name="flask-outline" size={20} color={colors.inkLight} />
          </View>
        )}
        {showIndex && (
          <View style={styles.indexBadge}>
            <Text style={styles.indexText}>{displayIndex}</Text>
          </View>
        )}
      </View>

      {/* ── Colonne droite : nom/marque à gauche, donut centré à droite ── */}
      <View style={styles.right}>
        <View style={styles.nameWrap}>
          <Text style={styles.name} numberOfLines={2}>
            {name}
          </Text>
          {brand ? (
            <Text style={styles.brand} numberOfLines={1}>
              {brand}
            </Text>
          ) : null}
        </View>
        <View style={styles.donutWrap}>
          <RoutineMiniDonut counts={counts} size={54} />
        </View>
      </View>
    </Pressable>
  )
})

const IMG_W = 58

const styles = StyleSheet.create({
  card: {
    height: ROUTINE_CARD_HEIGHT,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.sm,
    flexDirection: 'row',
    gap: spacing.sm,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  visualWrap: {
    width: IMG_W,
    height: '100%',
    borderRadius: radius.md,
    backgroundColor: colors.gray50,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  productImage: { width: '100%', height: '100%' },
  visualPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  indexBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(15,23,42,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  indexText: { fontFamily: fontFamilies.bold, fontSize: 10, color: '#FFFFFF' },
  right: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 2,
  },
  nameWrap: { flex: 1 },
  name: { fontFamily: fontFamilies.semiBold, fontSize: 14, color: colors.ink },
  brand: { fontFamily: fontFamilies.regular, fontSize: 11, color: colors.inkMuted, marginTop: 1 },
  donutWrap: { alignItems: 'center', justifyContent: 'center' },
})
