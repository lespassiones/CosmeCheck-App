/**
 * InferredPromisesCard — "Promesses déduites de la formule" (twin mobile).
 *
 * Promesses récupérées par la couche de renforcement bidirectionnel : un
 * ingrédient de la formule soutient un effet, et la description en parle.
 * Toujours "tenue" par construction. Ne rend rien s'il n'y en a pas.
 */

import { type FC } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import { colors } from '@/constants/colors'
import { spacing, radius } from '@/constants/spacing'
import { fontFamilies } from '@/constants/typography'
import type { CoherencePromise } from '@/lib/coherence/types'

const EMERALD_BG = 'rgba(236,253,245,0.7)'
const EMERALD_RING = '#A7F3D0'
const EMERALD_TEXT = '#047857'

export const InferredPromisesCard: FC<{ promises: CoherencePromise[] }> = ({ promises }) => {
  const inferred = promises.filter((p) => p.inferred)
  if (inferred.length === 0) return null

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.iconCircle}>
          <Ionicons name="checkmark" size={16} color={EMERALD_TEXT} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>
            Promesses déduites de la formule <Text style={styles.count}>({inferred.length})</Text>
          </Text>
          <Text style={styles.intro}>
            Des ingrédients de la formule soutiennent ces effets, et la description en parle. On les a
            ajoutés pour renforcer l&apos;analyse.
          </Text>
        </View>
      </View>

      <View style={styles.list}>
        {inferred.map((p) => {
          const source = p.foundActives[0]
          return (
            <View key={p.slug} style={styles.item}>
              <View style={styles.itemHead}>
                <Text style={styles.itemLabel}>{p.label}</Text>
                <View style={styles.deducedChip}>
                  <Text style={styles.deducedChipText}>Déduite</Text>
                </View>
              </View>
              {source ? (
                <Text style={styles.support}>
                  Soutien : <Text style={styles.supportName}>{source.name}</Text>{' '}
                  <Text style={styles.supportPos}>pos. {source.position}</Text>
                </Text>
              ) : null}
              {p.excerpt ? <Text style={styles.excerpt}>« {p.excerpt} »</Text> : null}
            </View>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: { backgroundColor: EMERALD_BG, borderWidth: 1, borderColor: EMERALD_RING, borderRadius: radius.card, padding: spacing.lg },
  header: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.base },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: EMERALD_RING,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1, minWidth: 0 },
  title: { fontFamily: fontFamilies.semiBold, fontSize: 15, color: colors.ink },
  count: { fontFamily: fontFamilies.medium, fontSize: 11, color: EMERALD_TEXT },
  intro: { fontFamily: fontFamilies.regular, fontSize: 12, lineHeight: 18, color: colors.inkMuted, marginTop: 4 },
  list: { gap: spacing.sm },
  item: { backgroundColor: colors.surface, borderWidth: 1, borderColor: EMERALD_RING, borderRadius: radius.md, padding: spacing.md },
  itemHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginBottom: 6 },
  itemLabel: { flex: 1, fontFamily: fontFamilies.semiBold, fontSize: 14, color: '#065F46' },
  deducedChip: { backgroundColor: '#D1FAE5', borderWidth: 1, borderColor: EMERALD_RING, borderRadius: 9999, paddingHorizontal: 8, paddingVertical: 2 },
  deducedChipText: { fontFamily: fontFamilies.semiBold, fontSize: 10, color: '#065F46' },
  support: { fontFamily: fontFamilies.regular, fontSize: 12, color: EMERALD_TEXT },
  supportName: { fontFamily: fontFamilies.medium },
  supportPos: { fontFamily: fontFamilies.regular, fontSize: 11, color: '#059669' },
  excerpt: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    fontStyle: 'italic',
    color: colors.inkMuted,
    borderLeftWidth: 2,
    borderLeftColor: EMERALD_RING,
    paddingLeft: spacing.sm,
    marginTop: 6,
  },
})
