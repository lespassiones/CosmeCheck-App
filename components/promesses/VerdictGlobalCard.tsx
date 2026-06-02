/**
 * VerdictGlobalCard — carte de synthèse haut de page (twin mobile du web).
 *
 * % de promesses soutenues à gauche, donut bicolore (vert = soutenu,
 * rose = non soutenu) à droite. Le segment vert + le grand chiffre s'animent
 * de 0 → cible à l'apparition (ease-out cubic ~1.6 s), respecte
 * prefers-reduced-motion.
 */

import { type FC, useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useReducedMotion } from 'react-native-reanimated'
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg'

import { WhiteCard } from '@/components/design/WhiteCard'
import { colors } from '@/constants/colors'
import { spacing } from '@/constants/spacing'
import { fontFamilies } from '@/constants/typography'
import type { CoherenceResult } from '@/lib/coherence/types'

const SIZE = 120
const STROKE = 18
const R = (SIZE - STROKE) / 2
const C = 2 * Math.PI * R

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

  const filled = (pct / 100) * C * progress
  const animatedPct = Math.round(pct * progress)

  return (
    <WhiteCard style={styles.card} padding={spacing.xl}>
      <Text style={styles.kicker}>VERDICT GLOBAL</Text>
      <View style={styles.row}>
        <View style={styles.left}>
          <View style={styles.bigRow}>
            <Text style={styles.big}>{animatedPct}</Text>
            <Text style={styles.bigPct}>%</Text>
          </View>
          <Text style={styles.caption}>
            Promesses soutenues : <Text style={styles.captionStrong}>{supportedCount}</Text> sur{' '}
            <Text style={styles.captionStrong}>{metrics.totalPromises}</Text>
          </Text>
          {metrics.tenueCount > 0 && metrics.partielleCount > 0 ? (
            <Text style={styles.subCaption}>
              {metrics.tenueCount} totalement, {metrics.partielleCount} partielle
              {metrics.partielleCount > 1 ? 's' : ''}
            </Text>
          ) : null}
        </View>

        <View style={styles.donutWrap}>
          <Svg width={SIZE} height={SIZE} style={styles.donut}>
            <Defs>
              <LinearGradient id="vc-rose" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0%" stopColor="#FB7185" />
                <Stop offset="100%" stopColor="#E11D48" />
              </LinearGradient>
              <LinearGradient id="vc-emerald" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0%" stopColor="#34D399" />
                <Stop offset="100%" stopColor="#059669" />
              </LinearGradient>
            </Defs>
            <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="url(#vc-rose)" strokeWidth={STROKE} />
            <Circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={R}
              fill="none"
              stroke="url(#vc-emerald)"
              strokeWidth={STROKE}
              strokeDasharray={`${C}`}
              strokeDashoffset={C - filled}
            />
          </Svg>
          <View style={styles.centerBadge}>
            <Text style={styles.centerText}>{animatedPct} %</Text>
          </View>
        </View>
      </View>
    </WhiteCard>
  )
}

const styles = StyleSheet.create({
  card: { flex: 1 },
  kicker: {
    fontFamily: fontFamilies.medium,
    fontSize: 11,
    letterSpacing: 1,
    color: colors.inkMuted,
    marginBottom: spacing.md,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  left: { flex: 1, minWidth: 0 },
  bigRow: { flexDirection: 'row', alignItems: 'flex-end' },
  big: { fontFamily: fontFamilies.bold, fontSize: 52, lineHeight: 56, color: colors.ink, letterSpacing: -1 },
  bigPct: { fontFamily: fontFamilies.bold, fontSize: 30, lineHeight: 44, color: colors.ink },
  caption: { fontFamily: fontFamilies.regular, fontSize: 13, lineHeight: 18, color: colors.inkMuted, marginTop: spacing.sm },
  captionStrong: { fontFamily: fontFamilies.semiBold, color: colors.ink },
  subCaption: { fontFamily: fontFamilies.regular, fontSize: 11, color: colors.inkLight, marginTop: 2 },
  donutWrap: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  donut: { transform: [{ rotate: '-90deg' }] },
  centerBadge: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 9999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
  },
  centerText: { fontFamily: fontFamilies.bold, fontSize: 13, color: colors.ink },
})
