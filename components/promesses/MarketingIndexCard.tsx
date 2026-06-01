/**
 * MarketingIndexCard — "Indice marketing" (twin mobile du web).
 *
 * % de promesses NON soutenues par la formule (verdicts marketing +
 * non_demontree + contredite) — même formule que engine.computeMetrics pour
 * que le grand chiffre et le sous-décompte ne divergent jamais. Sous le
 * chiffre : une explication nuancée + le détail par verdict.
 */

import { type FC } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { colors } from '@/constants/colors'
import { spacing, radius } from '@/constants/spacing'
import { fontFamilies } from '@/constants/typography'
import type { CoherenceResult } from '@/lib/coherence/types'

const ROSE_BG = 'rgba(255,241,242,0.7)'
const ROSE_RING = '#FFE4E6'
const ROSE_DEEP = '#BE123C'
const ROSE_TEXT = '#9F1239'

export const MarketingIndexCard: FC<{ metrics: CoherenceResult['metrics'] }> = ({ metrics }) => {
  const idx = metrics.marketingIndex
  const unsupportedCount = metrics.marketingCount + metrics.nonDemontreeCount + metrics.contrediteCount
  const total = metrics.totalPromises

  const breakdown: { count: number; label: string; color: string }[] = [
    { count: metrics.tenueCount, label: 'tenue', color: colors.verdict.tenue.DEFAULT },
    { count: metrics.partielleCount, label: 'partielle', color: colors.verdict.partielle.DEFAULT },
    { count: metrics.marketingCount, label: 'marketing', color: colors.verdict.marketing.DEFAULT },
    { count: metrics.nonDemontreeCount, label: 'non démontrée', color: colors.verdict.non_demontree.DEFAULT },
    { count: metrics.contrediteCount, label: 'contredite', color: colors.verdict.contredite.DEFAULT },
  ].filter((b) => b.count > 0)

  return (
    <View style={styles.card}>
      <Text style={styles.kicker}>INDICE MARKETING</Text>
      <Text style={styles.big}>{idx} %</Text>
      <Text style={styles.subCount}>
        {unsupportedCount} promesse{unsupportedCount > 1 ? 's' : ''} sur {total} non soutenue
        {unsupportedCount > 1 ? 's' : ''} par la formule
      </Text>

      <Text style={styles.body}>
        {total === 0
          ? "La description ne contient aucune promesse d'effet vérifiable — uniquement des mentions générales."
          : unsupportedCount === 0
            ? 'Toutes les promesses détectées ont au moins un actif documenté dans la formule pour les soutenir. C’est cohérent.'
            : `${unsupportedCount} promesse${unsupportedCount > 1 ? 's' : ''} sur ${total} n’${
                unsupportedCount > 1 ? 'ont ' : 'a '
              }pas d’ingrédient clair dans la formule pour ${
                unsupportedCount > 1 ? 'les' : 'la'
              } soutenir. Cela ne veut pas forcément dire que c’est faux.`}
      </Text>

      {breakdown.length > 0 ? (
        <View style={styles.breakdown}>
          {breakdown.map((b) => (
            <View key={b.label} style={styles.bItem}>
              <View style={[styles.bDot, { backgroundColor: b.color }]} />
              <Text style={styles.bText}>
                {b.count} {b.label}
                {b.count > 1 && (b.label === 'partielle' || b.label === 'tenue' || b.label === 'contredite' || b.label === 'non démontrée') ? 's' : ''}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: ROSE_BG,
    borderWidth: 1,
    borderColor: ROSE_RING,
    borderRadius: radius.card,
    padding: spacing.lg,
  },
  kicker: { fontFamily: fontFamilies.semiBold, fontSize: 11, letterSpacing: 1, color: ROSE_DEEP, marginBottom: 4 },
  big: { fontFamily: fontFamilies.bold, fontSize: 48, lineHeight: 52, color: ROSE_DEEP, letterSpacing: -1 },
  subCount: { fontFamily: fontFamilies.regular, fontSize: 11, color: ROSE_TEXT, opacity: 0.85, marginTop: 4 },
  body: { fontFamily: fontFamilies.regular, fontSize: 13, lineHeight: 19, color: ROSE_TEXT, marginTop: spacing.md },
  breakdown: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.md },
  bItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bDot: { width: 6, height: 6, borderRadius: 3 },
  bText: { fontFamily: fontFamilies.regular, fontSize: 11, color: colors.inkMuted },
})
