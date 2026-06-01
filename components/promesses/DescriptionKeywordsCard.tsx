/**
 * DescriptionKeywordsCard — "Ce qu'on a lu sur l'emballage" (twin mobile).
 *
 * Deux sections de pills :
 *   - "Promesses analysées" : extraites de la description, colorées par verdict.
 *   - "Promesses non analysées" : fragments non vérifiables (composition,
 *     certification, sensoriel, marketing général).
 */

import { type FC } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { GlassCard } from '@/components/design/GlassCard'
import { colors } from '@/constants/colors'
import { spacing } from '@/constants/spacing'
import { fontFamilies } from '@/constants/typography'
import type { CoherencePromise, UnverifiableClaim } from '@/lib/coherence/types'
import { VERDICT_TONE } from './tone'

export const DescriptionKeywordsCard: FC<{
  promises: CoherencePromise[]
  unverifiable: UnverifiableClaim[]
}> = ({ promises, unverifiable }) => {
  if (promises.length === 0 && unverifiable.length === 0) return null

  return (
    <GlassCard padding={spacing.lg}>
      <Text style={styles.title}>Ce qu&apos;on a lu sur l&apos;emballage</Text>
      <Text style={styles.subtitle}>
        Les promesses extraites (avec leur verdict) et les mentions non analysables côté formule.
      </Text>

      <Text style={styles.sectionLabel}>PROMESSES ANALYSÉES</Text>
      {promises.length === 0 ? (
        <Text style={styles.empty}>Aucune promesse analysable détectée.</Text>
      ) : (
        <View style={styles.chipsWrap}>
          {promises.map((p) => {
            const tone = VERDICT_TONE[p.verdict]
            return (
              <View
                key={p.slug + p.excerpt}
                style={[styles.chip, { backgroundColor: tone.soft, borderColor: tone.ring }]}
              >
                <View style={[styles.chipDot, { backgroundColor: tone.solid }]} />
                <Text style={[styles.chipText, { color: tone.text }]}>{p.label.toLowerCase()}</Text>
              </View>
            )
          })}
        </View>
      )}

      <Text style={[styles.sectionLabel, styles.secondSection]}>PROMESSES NON ANALYSÉES</Text>
      {unverifiable.length === 0 ? (
        <Text style={styles.empty}>Toutes les mentions sont rattachées à une promesse analysée.</Text>
      ) : (
        <View style={styles.chipsWrap}>
          {unverifiable.map((u, i) => (
            <View key={i} style={styles.neutralChip}>
              <Text style={styles.neutralChipText}>
                {u.excerpt.length > 36 ? `${u.excerpt.slice(0, 36)}…` : u.excerpt}
              </Text>
            </View>
          ))}
        </View>
      )}
    </GlassCard>
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
  sectionLabel: { fontFamily: fontFamilies.semiBold, fontSize: 11, letterSpacing: 0.8, color: colors.inkMuted, marginBottom: spacing.sm },
  secondSection: { marginTop: spacing.base },
  empty: { fontFamily: fontFamilies.regular, fontSize: 12, color: colors.inkLight },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 9999, paddingHorizontal: 10, paddingVertical: 4 },
  chipDot: { width: 6, height: 6, borderRadius: 3 },
  chipText: { fontFamily: fontFamilies.medium, fontSize: 12 },
  neutralChip: { backgroundColor: colors.gray100, borderWidth: 1, borderColor: colors.border, borderRadius: 9999, paddingHorizontal: 10, paddingVertical: 4 },
  neutralChipText: { fontFamily: fontFamilies.medium, fontSize: 12, color: colors.gray600 },
})
