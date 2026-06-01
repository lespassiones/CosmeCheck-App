/**
 * PromisesBarChart — "Détail par promesse" (twin mobile du web).
 *
 * Une ligne par promesse : libellé, barre de progression colorée selon le
 * verdict, % et pastille. Les barres se remplissent de 0 → cible à
 * l'apparition (ease-out cubic), respecte prefers-reduced-motion.
 */

import { type FC, useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useReducedMotion } from 'react-native-reanimated'

import { GlassCard } from '@/components/design/GlassCard'
import { colors } from '@/constants/colors'
import { spacing } from '@/constants/spacing'
import { fontFamilies } from '@/constants/typography'
import type { CoherencePromise } from '@/lib/coherence/types'
import { VERDICT_TONE } from './tone'

export const PromisesBarChart: FC<{ promises: CoherencePromise[] }> = ({ promises }) => {
  const reduceMotion = useReducedMotion()
  const [progress, setProgress] = useState(reduceMotion ? 1 : 0)

  useEffect(() => {
    if (reduceMotion) {
      setProgress(1)
      return
    }
    let raf: number
    const duration = 1600
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

  if (promises.length === 0) return null

  return (
    <GlassCard style={styles.card} padding={spacing.lg}>
      <Text style={styles.title}>Détail par promesse</Text>
      <Text style={styles.subtitle}>
        Plus la barre est remplie, plus la promesse est documentée par les ingrédients de la formule.
      </Text>

      <View style={styles.list}>
        {promises.map((p) => {
          const tone = VERDICT_TONE[p.verdict]
          const target = Math.max(4, p.score)
          const animatedWidth = Math.max(progress > 0 ? 4 : 0, target * progress)
          const animatedPct = Math.round(p.score * progress)
          return (
            <View key={p.slug + p.excerpt} style={styles.row}>
              <Text style={styles.label} numberOfLines={1}>
                {p.label}
              </Text>
              <View style={styles.track}>
                <View
                  style={[styles.fill, { width: `${animatedWidth}%`, backgroundColor: tone.solid }]}
                />
              </View>
              <Text style={styles.pct}>{animatedPct} %</Text>
              <View style={[styles.dot, { backgroundColor: tone.solid }]} />
            </View>
          )
        })}
      </View>
    </GlassCard>
  )
}

const styles = StyleSheet.create({
  card: {},
  title: { fontFamily: fontFamilies.semiBold, fontSize: 16, color: colors.ink },
  subtitle: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 17,
    color: colors.inkMuted,
    marginTop: 4,
    marginBottom: spacing.base,
  },
  list: { gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  label: { flexBasis: 110, flexShrink: 0, fontFamily: fontFamilies.medium, fontSize: 12, color: colors.ink },
  track: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.gray100, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  pct: { width: 38, textAlign: 'right', fontFamily: fontFamilies.regular, fontSize: 12, color: colors.inkMuted },
  dot: { width: 9, height: 9, borderRadius: 5 },
})
