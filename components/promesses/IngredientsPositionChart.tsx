/**
 * IngredientsPositionChart — "Où se trouvent les ingrédients clés ?"
 * (twin mobile du web).
 *
 * Deux zones côte à côte séparées par un marqueur de seuil ≤ 1 % :
 *   - GAUCHE (verte) : ingrédients efficaces (positions 1 .. seuil-1)
 *   - DROITE (bleue) : ingrédients en trace ≤ 1 % (positions seuil+1 ..)
 * Chaque ingrédient clé est une pastille teintée par son rating de sécurité.
 * Rendue uniquement si un seuil (parfum/conservateur) existe.
 */

import { type FC } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { WhiteCard } from '@/components/design/WhiteCard'
import { colors } from '@/constants/colors'
import { spacing, radius } from '@/constants/spacing'
import { fontFamilies } from '@/constants/typography'
import type { CoherenceResult } from '@/lib/coherence/types'

type Key = CoherenceResult['positionSnapshot']['keyIngredients'][number]

const ZONE_TONE = {
  Vert: { bg: '#ECFDF5', border: '#A7F3D0', name: '#065F46', pos: '#059669' },
  Jaune: { bg: '#FFFBEB', border: '#FDE68A', name: '#92400E', pos: '#B45309' },
  Orange: { bg: '#FFF7ED', border: '#FED7AA', name: '#9A3412', pos: '#C2410C' },
  Rouge: { bg: '#FFF1F2', border: '#FECDD3', name: '#9F1239', pos: '#BE123C' },
} as const

const Bubble: FC<{ item: Key }> = ({ item }) => {
  const tone = item.colorRating ? ZONE_TONE[item.colorRating] : null
  return (
    <View
      style={[
        styles.bubble,
        tone
          ? { backgroundColor: tone.bg, borderColor: tone.border }
          : { backgroundColor: colors.surface, borderColor: colors.borderMuted },
      ]}
    >
      <Text
        style={[styles.bubbleName, { color: tone ? tone.name : colors.ink }]}
        numberOfLines={1}
      >
        {item.name}
      </Text>
      <Text style={[styles.bubblePos, { color: tone ? tone.pos : colors.inkLight }]}>
        pos. {item.position}
      </Text>
    </View>
  )
}

export const IngredientsPositionChart: FC<{ snapshot: CoherenceResult['positionSnapshot'] }> = ({
  snapshot,
}) => {
  const { thresholdPos, totalPositions, keyIngredients, firstFragrancePos } = snapshot

  if (thresholdPos === null || totalPositions === 0) return null

  const before = keyIngredients.filter((k) => !k.inTrace)
  const after = keyIngredients.filter((k) => k.inTrace)
  const thresholdLabel = firstFragrancePos !== null ? 'Parfum' : 'Conservateur'

  return (
    <WhiteCard padding={spacing.lg}>
      <Text style={styles.title}>Où se trouvent les ingrédients clés ?</Text>
      <Text style={styles.subtitle}>
        Tout ce qui est après le parfum (ou le 1ᵉʳ conservateur) est dosé à moins de 1 %, donc avec peu
        d&apos;effet réel.
      </Text>

      <View style={styles.zones}>
        {/* Zone verte */}
        <View style={[styles.zone, styles.zoneGreen]}>
          <Text style={[styles.zoneTitle, { color: '#047857' }]}>Ingrédients efficaces</Text>
          <Text style={[styles.zoneRange, { color: '#059669' }]}>positions 1–{thresholdPos - 1}</Text>
          {before.length === 0 ? (
            <Text style={[styles.zoneEmpty, { color: '#059669' }]}>Aucun ingrédient clé ici.</Text>
          ) : (
            <View style={styles.bubbles}>
              {before.map((k) => (
                <Bubble key={`b-${k.position}-${k.name}`} item={k} />
              ))}
            </View>
          )}
        </View>

        {/* Marqueur de seuil */}
        <View style={styles.divider}>
          <View style={styles.dividerDot} />
          <View style={styles.dividerLine} />
          <View style={styles.dividerDot} />
          <Text style={styles.dividerLabel}>{thresholdLabel}</Text>
          <Text style={styles.dividerPos}>pos. {thresholdPos}</Text>
        </View>

        {/* Zone bleue */}
        <View style={[styles.zone, styles.zoneBlue]}>
          <Text style={[styles.zoneTitle, { color: '#0369A1' }]}>En trace ≤ 1 %</Text>
          <Text style={[styles.zoneRange, { color: '#0284C7' }]}>
            positions {thresholdPos + 1}–{totalPositions}
          </Text>
          {after.length === 0 ? (
            <Text style={[styles.zoneEmpty, { color: '#0284C7' }]}>Aucun ingrédient clé ici.</Text>
          ) : (
            <View style={styles.bubbles}>
              {after.map((k) => (
                <Bubble key={`a-${k.position}-${k.name}`} item={k} />
              ))}
            </View>
          )}
        </View>
      </View>
    </WhiteCard>
  )
}

const styles = StyleSheet.create({
  title: { fontFamily: fontFamilies.semiBold, fontSize: 16, color: colors.ink },
  subtitle: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 17,
    color: colors.inkMuted,
    marginTop: 4,
    marginBottom: spacing.base,
  },
  zones: { flexDirection: 'row', alignItems: 'stretch', borderRadius: radius.lg, overflow: 'hidden' },
  zone: { flex: 1, padding: spacing.md, minHeight: 130 },
  zoneGreen: { backgroundColor: 'rgba(209,250,229,0.55)' },
  zoneBlue: { backgroundColor: 'rgba(224,242,254,0.55)' },
  zoneTitle: { fontFamily: fontFamilies.bold, fontSize: 12, textAlign: 'center' },
  zoneRange: { fontFamily: fontFamilies.regular, fontSize: 10, textAlign: 'center', marginTop: 2, marginBottom: spacing.sm },
  zoneEmpty: { fontFamily: fontFamilies.regular, fontSize: 11, fontStyle: 'italic', textAlign: 'center', opacity: 0.7, marginTop: spacing.sm },
  bubbles: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 },
  bubble: {
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 9999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    maxWidth: 120,
  },
  bubbleName: { fontFamily: fontFamilies.medium, fontSize: 10, textAlign: 'center' },
  bubblePos: { fontFamily: fontFamilies.regular, fontSize: 8, marginTop: 1 },
  divider: { width: 2, alignItems: 'center', justifyContent: 'flex-start', paddingTop: spacing.md },
  dividerDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#38BDF8' },
  dividerLine: { flex: 1, width: 2, backgroundColor: '#7DD3FC', marginVertical: 2 },
  dividerLabel: { fontFamily: fontFamilies.semiBold, fontSize: 10, color: '#0369A1', width: 56, textAlign: 'center', marginTop: 2 },
  dividerPos: { fontFamily: fontFamilies.regular, fontSize: 9, color: '#0284C7', width: 56, textAlign: 'center' },
})
