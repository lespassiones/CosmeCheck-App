/**
 * « Tes objectifs » : après le score de compatibilité, juste avant le paywall.
 *
 * Le produit scanné, objectif par objectif : ce qu'il couvre (et à combien de
 * pour cent), puis ce qui reste à couvrir. Sous 3 objectifs cochés, Perle en
 * ajoute d'après le profil (« Suggéré », avec la raison). Le bouton du bas est
 * un passage à l'action : compléter ce qui manque, c'est ce que fait Premium.
 *
 * Calcul : `lib/onboarding/goalsCoverage.ts` (pur, testé) sur les notes de
 * l'IA (`onboarding-goals`), règle de secours si l'IA ne répond pas.
 */

import { useEffect, useState, type FC } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import Animated from 'react-native-reanimated'

import { colors } from '@/constants/colors'
import { fontFamilies } from '@/constants/typography'
import { AnimatedGaugeFill, useCountUp } from '@/components/design/motion'
import { haptic } from '@/lib/haptics'
import { ctaLabel, ctaPitch, toComplete, type CoverageRow } from '@/lib/onboarding/goalsCoverage'
import { loadGoalsCoverage, type LoadedCoverage } from '@/lib/onboarding/goalsCoverageFetch'
import { fade, fadeUp } from '@/components/onboarding/flow/motion'
import {
  Eyebrow,
  Gap,
  PerleBubble,
  PrimaryButton,
  RevealAt,
  StepLayout,
  fitFont,
  fitSize,
  useFit,
} from '@/components/onboarding/flow/ui'
import type { StepProps } from '@/components/onboarding/flow/types'

const TONE_COLOR: Record<CoverageRow['tone'], string> = {
  vert: colors.rating.vert.DEFAULT,
  jaune: colors.rating.jaune.DEFAULT,
  orange: colors.rating.orange.DEFAULT,
  rouge: colors.rating.rouge.DEFAULT,
}

// Déroulé, en ms depuis l'arrivée sur l'écran.
const SUMMARY_AT = 350
const ROWS_AT = 750
const ROW_STEP = 170

const GoalRow: FC<{ row: CoverageRow; delay: number }> = ({ row, delay }) => {
  const fit = useFit()
  const label = fitFont(15, fit)
  const small = fitFont(12.5, fit)
  const covered = row.percent > 0
  const shown = useCountUp(row.percent, row.key, 900, delay + 150)
  return (
    <Animated.View entering={fadeUp(delay, 10, 380)} style={{ paddingVertical: fitSize(7, fit) }}>
      <View style={styles.rowHead}>
        <View style={styles.rowTexts}>
          <Text style={[styles.rowLabel, { fontSize: label, lineHeight: Math.round(label * 1.3) }]} numberOfLines={2}>
            {row.label}
          </Text>
          {row.suggested ? (
            <Text style={[styles.rowWhy, { fontSize: small, lineHeight: Math.round(small * 1.35) }]} numberOfLines={1}>
              <Text style={styles.suggestedTag}>Suggéré</Text>
              {row.why ? ` · ${row.why}` : ''}
            </Text>
          ) : null}
        </View>
        <Text style={[styles.rowPct, { fontSize: label, color: covered ? TONE_COLOR[row.tone] : colors.inkLight }]}>
          {covered ? `${shown} %` : '0 %'}
        </Text>
      </View>
      <View style={[styles.track, { height: fitSize(7, fit), marginTop: fitSize(6, fit) }]}>
        {covered ? (
          <AnimatedGaugeFill percent={row.percent} color={TONE_COLOR[row.tone]} delay={delay + 150} duration={900} />
        ) : null}
      </View>
    </Animated.View>
  )
}

const SectionLabel: FC<{ children: string; delay: number }> = ({ children, delay }) => (
  <Animated.View entering={fade(delay, 350)}>
    <Eyebrow align="left" color={colors.inkMuted}>
      {children}
    </Eyebrow>
  </Animated.View>
)

export const GoalsCoverageStep: FC<StepProps> = ({ draft, next, firstName }) => {
  const [data, setData] = useState<LoadedCoverage | null>(null)

  useEffect(() => {
    let alive = true
    const pending = loadGoalsCoverage(draft)
    if (!pending) return
    void pending.then((r) => {
      if (alive) setData(r)
    })
    return () => {
      alive = false
    }
    // Brouillon figé à ce stade du parcours : une seule lecture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!data) return
    const t = setTimeout(haptic.success, ROWS_AT + 300)
    return () => clearTimeout(t)
  }, [data])

  const total = data?.rows.length ?? 0
  const coveredCount = data?.covered.length ?? 0
  const shownCovered = useCountUp(coveredCount, total, 700, SUMMARY_AT + 200)

  if (!data) {
    return (
      <StepLayout key="lecture" footer={<PrimaryButton label="Continuer" onPress={next} disabled />}>
        <Gap h={16} />
        <PerleBubble>Je regarde ce que ce produit fait pour tes objectifs…</PerleBubble>
        <Gap h={40} />
        <ActivityIndicator color={colors.rose} size="large" />
      </StepLayout>
    )
  }

  const suggestedCount = data.rows.filter((r) => r.suggested).length
  const incomplete = toComplete(data.rows)
  const missingAt = ROWS_AT + data.covered.length * ROW_STEP + 200
  const endAt = missingAt + data.missing.length * ROW_STEP + 200
  const who = firstName ? `, ${firstName}` : ''
  const bubble =
    suggestedCount > 0
      ? `Voilà ce que ce produit fait pour tes objectifs${who}. J'en ai ajouté ${suggestedCount === 1 ? 'un' : suggestedCount} d'après ton profil.`
      : `Voilà ce que ce produit fait pour tes objectifs${who}.`
  const pitch = ctaPitch(incomplete, data.missing.length)

  return (
    <StepLayout
      key="couverture"
      animate={false}
      footerDelay={endAt + 300}
      footer={
        <>
          <Text style={styles.pitch}>{pitch}</Text>
          <PrimaryButton label={ctaLabel(incomplete)} iconRight="arrow-forward" onPress={next} />
        </>
      }
    >
      <Gap h={14} />
      <RevealAt delay={0}>
        <PerleBubble>{bubble}</PerleBubble>
      </RevealAt>
      <Gap h={18} />
      <Animated.View entering={fadeUp(SUMMARY_AT, 10, 420)} style={styles.summary}>
        <Text style={styles.summaryNum}>
          {shownCovered}
          <Text style={styles.summaryOf}>{` / ${total}`}</Text>
        </Text>
        <Text style={styles.summaryLabel}>
          {total > 1 ? 'objectifs couverts par ce produit' : 'objectif couvert par ce produit'}
        </Text>
      </Animated.View>
      <Gap h={16} />
      {data.covered.length > 0 ? (
        <>
          <SectionLabel delay={ROWS_AT - 150}>CE PRODUIT T'AIDE POUR</SectionLabel>
          {data.covered.map((r, i) => (
            <GoalRow key={r.key} row={r} delay={ROWS_AT + i * ROW_STEP} />
          ))}
        </>
      ) : null}
      {data.missing.length > 0 ? (
        <>
          <Gap h={data.covered.length > 0 ? 14 : 0} />
          <SectionLabel delay={missingAt - 150}>ENCORE À COUVRIR</SectionLabel>
          {data.missing.map((r, i) => (
            <GoalRow key={r.key} row={r} delay={missingAt + i * ROW_STEP} />
          ))}
        </>
      ) : null}
      <Gap h={12} />
      <Animated.View entering={fade(endAt, 400)}>
        <Text style={styles.note}>Calculé d'après les actifs du produit et sa qualité, comme dans l'app.</Text>
      </Animated.View>
    </StepLayout>
  )
}

const styles = StyleSheet.create({
  summary: { alignItems: 'center' },
  summaryNum: { fontFamily: fontFamilies.bold, fontSize: 44, lineHeight: 50, color: colors.ink, letterSpacing: -1 },
  summaryOf: { fontFamily: fontFamilies.semiBold, fontSize: 26, color: colors.inkLight, letterSpacing: 0 },
  summaryLabel: { fontFamily: fontFamilies.medium, fontSize: 14.5, color: colors.inkMuted, marginTop: 2 },
  rowHead: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  rowTexts: { flex: 1, gap: 2 },
  rowLabel: { fontFamily: fontFamilies.semiBold, color: colors.ink },
  rowWhy: { fontFamily: fontFamilies.regular, color: colors.inkMuted },
  suggestedTag: { fontFamily: fontFamilies.semiBold, color: colors.roseDeep },
  rowPct: { fontFamily: fontFamilies.bold, fontVariant: ['tabular-nums'] },
  track: { borderRadius: 999, backgroundColor: colors.gray200, overflow: 'hidden' },
  note: { fontFamily: fontFamilies.regular, fontSize: 12.5, lineHeight: 17, color: colors.inkLight, textAlign: 'center' },
  pitch: {
    fontFamily: fontFamilies.medium,
    fontSize: 14.5,
    lineHeight: 20,
    color: colors.ink,
    textAlign: 'center',
  },
})
