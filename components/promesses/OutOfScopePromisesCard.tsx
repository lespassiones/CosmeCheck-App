/**
 * OutOfScopePromisesCard — "Promesses hors-sujet" (twin mobile du web).
 *
 * Promesses marketing sans sens biologique pour le type de produit détecté
 * (ex : "production de collagène" sur un produit capillaire). Ton ambré neutre
 * (on explique, on n'accuse pas). Ne rend rien si la liste est vide.
 */

import { type FC } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import { colors } from '@/constants/colors'
import { spacing, radius } from '@/constants/spacing'
import { fontFamilies } from '@/constants/typography'
import { PRODUCT_TYPE_LABELS, type OutOfScopePromise, type ProductType } from '@/lib/coherence/types'

const AMBER_BG = 'rgba(255,251,235,0.7)'
const AMBER_RING = '#FDE68A'
const AMBER_TEXT = '#B45309'

export const OutOfScopePromisesCard: FC<{
  items: OutOfScopePromise[] | undefined
  productType: ProductType | undefined
}> = ({ items, productType }) => {
  if (!items || items.length === 0) return null
  const typeLabel = productType ? PRODUCT_TYPE_LABELS[productType] : null

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.iconCircle}>
          <Ionicons name="information-circle-outline" size={16} color={AMBER_TEXT} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>
            Promesses hors-sujet <Text style={styles.count}>({items.length})</Text>
          </Text>
          <Text style={styles.intro}>
            {typeLabel
              ? `La description fait des promesses sans sens biologique pour un produit de type « ${typeLabel} ». On les liste ici, hors du verdict global.`
              : 'La description fait des promesses sans sens biologique pour ce type de produit. On les liste ici, hors du verdict global.'}
          </Text>
        </View>
      </View>

      <View style={styles.list}>
        {items.map((o, i) => (
          <View key={`${o.excerpt}-${i}`} style={styles.item}>
            <View style={styles.itemHead}>
              {o.claimed_effect ? (
                <View style={styles.effectChip}>
                  <Text style={styles.effectChipText}>{o.claimed_effect}</Text>
                </View>
              ) : null}
              <Text style={styles.excerpt}>« {o.excerpt} »</Text>
            </View>
            <Text style={styles.reason}>{o.reason}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: { backgroundColor: AMBER_BG, borderWidth: 1, borderColor: AMBER_RING, borderRadius: radius.card, padding: spacing.lg },
  header: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.base },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: AMBER_RING,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1, minWidth: 0 },
  title: { fontFamily: fontFamilies.semiBold, fontSize: 15, color: colors.ink },
  count: { fontFamily: fontFamilies.medium, fontSize: 11, color: AMBER_TEXT },
  intro: { fontFamily: fontFamilies.regular, fontSize: 12, lineHeight: 18, color: colors.inkMuted, marginTop: 4 },
  list: { gap: spacing.md },
  item: { backgroundColor: colors.surface, borderWidth: 1, borderColor: AMBER_RING, borderRadius: radius.md, padding: spacing.md },
  itemHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, marginBottom: 6 },
  effectChip: { backgroundColor: '#FEF3C7', borderRadius: 9999, paddingHorizontal: 9, paddingVertical: 2 },
  effectChipText: { fontFamily: fontFamilies.medium, fontSize: 11, color: '#92400E' },
  excerpt: { flex: 1, fontFamily: fontFamilies.regular, fontSize: 12.5, fontStyle: 'italic', color: colors.ink },
  reason: { fontFamily: fontFamilies.regular, fontSize: 12.5, lineHeight: 18, color: colors.inkMuted },
})
