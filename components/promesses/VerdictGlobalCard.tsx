/**
 * VerdictGlobalCard — hero de synthèse (refonte épurée, twin du mockup).
 *
 * Grand donut vert pastel centré sur le % de promesses tenues, et à droite une
 * pile de pastilles par verdict (tenues / partielles / non démontrées…). Sous
 * le donut, une ligne « Globalement tenu · X sur Y ». Le donut + le grand
 * chiffre s'animent de 0 → cible à l'apparition (ease-out cubic), respecte
 * prefers-reduced-motion.
 *
 * PRÉSENTATION UNIQUEMENT : les métriques arrivent telles quelles du backend.
 */

import { type FC, useEffect, useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useReducedMotion } from 'react-native-reanimated'
import Svg, { Circle } from 'react-native-svg'

import { WhiteCard } from '@/components/design/WhiteCard'
import { colors } from '@/constants/colors'
import { radius, spacing } from '@/constants/spacing'
import { fontFamilies } from '@/constants/typography'
import type { CoherenceResult, CoherenceVerdict } from '@/lib/coherence/types'
import { VERDICT_TONE, verdictChipLabel } from './tone'

const SIZE = 150
const STROKE = 14
const R = (SIZE - STROKE) / 2
const C = 2 * Math.PI * R

/** Libellé de synthèse dérivé du % de promesses tenues (présentation pure). */
function globalLabel(pct: number): string {
  if (pct >= 80) return 'Globalement tenu'
  if (pct >= 50) return 'Partiellement tenu'
  if (pct > 0) return 'Peu tenu'
  return 'Non démontré'
}

export const VerdictGlobalCard: FC<{ metrics: CoherenceResult['metrics'] }> = ({ metrics }) => {
  const pct = metrics.tenuePct
  const supportedCount = metrics.tenueCount + metrics.partielleCount
  const reduceMotion = useReducedMotion()
  const [progress, setProgress] = useState(reduceMotion ? 1 : 0)

  useEffect(() => {
    if (reduceMotion) {
      setProgress(1)
      return
    }
    let raf: number
    const duration = 1400
    const start = Date.now()
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setProgress(eased)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [reduceMotion])

  const filled = (pct / 100) * C * progress
  const animatedPct = Math.round(pct * progress)

  // Pastilles de synthèse : une par verdict présent, dans l'ordre du barème.
  const chips = useMemo(() => {
    const order: { verdict: CoherenceVerdict; count: number }[] = [
      { verdict: 'tenue', count: metrics.tenueCount },
      { verdict: 'partielle', count: metrics.partielleCount },
      { verdict: 'marketing', count: metrics.marketingCount },
      { verdict: 'non_demontree', count: metrics.nonDemontreeCount },
      { verdict: 'contredite', count: metrics.contrediteCount },
    ]
    return order.filter((c) => c.count > 0)
  }, [metrics])

  return (
    <WhiteCard style={styles.card} padding={spacing.xl}>
      <View style={styles.row}>
        <View style={styles.donutWrap}>
          <Svg width={SIZE} height={SIZE} style={styles.donut}>
            <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke={colors.gray100} strokeWidth={STROKE} />
            <Circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={R}
              fill="none"
              stroke={colors.verdict.tenue.DEFAULT}
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={`${C}`}
              strokeDashoffset={C - filled}
            />
          </Svg>
          <View style={styles.centerLabel}>
            <View style={styles.bigRow}>
              <Text style={styles.big}>{animatedPct}</Text>
              <Text style={styles.bigPct}>%</Text>
            </View>
          </View>
        </View>

        <View style={styles.chips}>
          {chips.map((c) => {
            const tone = VERDICT_TONE[c.verdict]
            return (
              <View key={c.verdict} style={[styles.chip, { backgroundColor: tone.soft }]}>
                <View style={[styles.chipDot, { backgroundColor: tone.solid }]} />
                <Text style={[styles.chipText, { color: tone.text }]} numberOfLines={1}>
                  {verdictChipLabel(c.verdict, c.count)}
                </Text>
              </View>
            )
          })}
        </View>
      </View>

      <Text style={styles.footer}>
        {globalLabel(pct)} · <Text style={styles.footerStrong}>{supportedCount} sur {metrics.totalPromises}</Text>
      </Text>
    </WhiteCard>
  )
}

const styles = StyleSheet.create({
  card: {},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.lg,
  },
  donutWrap: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  donut: { transform: [{ rotate: '-90deg' }] },
  centerLabel: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  bigRow: { flexDirection: 'row', alignItems: 'flex-start' },
  big: { fontFamily: fontFamilies.bold, fontSize: 40, lineHeight: 44, color: colors.ink, letterSpacing: -1 },
  bigPct: { fontFamily: fontFamilies.bold, fontSize: 20, lineHeight: 26, color: colors.ink, marginTop: 2 },
  chips: { flex: 1, gap: spacing.sm, alignItems: 'flex-start' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: radius.full,
    paddingVertical: 6,
    paddingHorizontal: 12,
    maxWidth: '100%',
  },
  chipDot: { width: 8, height: 8, borderRadius: 4 },
  chipText: { fontFamily: fontFamilies.medium, fontSize: 12, flexShrink: 1 },
  footer: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    color: colors.inkMuted,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  footerStrong: { fontFamily: fontFamilies.semiBold, color: colors.ink },
})
