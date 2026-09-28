/**
 * Écrans de réaction : on rend à la personne ce qu'elle vient de dire, avec
 * quelque chose qu'elle ne savait pas. Aucun chiffre inventé : ceux qui
 * s'affichent sont calculés sur ses réponses (`lib/onboarding/content.ts`).
 *
 * Chaque écran a son moment fort, marqué par un mouvement ET une vibration :
 * le type de peau qui « pop », les soucis qui arrivent comme des messages, le
 * chiffre qui tombe, la courbe du plan qui se dessine.
 */

import { useEffect, useRef, useState, type FC } from 'react'
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { Image } from 'expo-image'
import { Ionicons } from '@expo/vector-icons'
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import { Caveat_700Bold, useFonts } from '@expo-google-fonts/caveat'
import Svg, { Circle, Defs, LinearGradient, Line, Path, Stop } from 'react-native-svg'

import { colors } from '@/constants/colors'
import { fontFamilies } from '@/constants/typography'
import { haptic } from '@/lib/haptics'
import {
  CONCERN_OPTIONS,
  RESTRICTION_OPTIONS,
  ingredientsPerDay,
  planChartNotes,
  planLead,
  planLines,
  skinRevealFor,
  truthBubble,
  truthTitle,
} from '@/lib/onboarding/content'
import { EASE_OUT, RM, fade, fadeSide, fadeUp, softScaleIn } from '@/components/onboarding/flow/motion'
import { ConcernIcon, Sparkle } from '@/components/onboarding/flow/icons'
import {
  Accent,
  Body,
  BubbleText,
  Cascade,
  Eyebrow,
  Gap,
  PerleBubble,
  PopIn,
  PrimaryButton,
  RevealAt,
  StepLayout,
  Title,
  selfAnimated,
  useRevealDelay,
} from '@/components/onboarding/flow/ui'
import type { StepProps } from '@/components/onboarding/flow/types'


function restrictionShorts(keys: readonly string[]): string[] {
  return keys
    .map((k) => RESTRICTION_OPTIONS.find((o) => o.key === k)?.short)
    .filter((s): s is string => Boolean(s))
}

// ── A8 : ce que ça dit de ta peau ────────────────────────────────────────

export const SkinRevealStep: FC<StepProps> = ({ draft, next }) => {
  const answer = draft.skinTest ?? 'inconnu'
  const v = skinRevealFor(answer, draft.skinSensitive)
  const long = v.title.length > 16
  return (
    <StepLayout footer={<PrimaryButton label="Continuer" onPress={next} />}>
      <Gap h={12} />
      <Eyebrow>CE QUE ÇA DIT DE TA PEAU</Eyebrow>
      <PopIn onShown={haptic.success}>
        <Title size={answer === 'inconnu' ? 32 : long ? 34 : 42}>{v.title}</Title>
      </PopIn>
      <Gap h={12} />
      <Body>{v.text}</Body>
      <Gap h={24} />
      <View style={styles.card}>
        <Text style={styles.cardLabel}>À SURVEILLER POUR TOI</Text>
        <Cascade from="right" step={140}>
          {v.watch.map((w, i) => (
            <View key={w.inci} style={[styles.watchRow, i > 0 && styles.divider]}>
              <View style={styles.orangePill}>
                <Text style={styles.orangePillText}>{w.inci}</Text>
              </View>
              <Text style={styles.watchWhy}>{w.why}</Text>
            </View>
          ))}
        </Cascade>
      </View>
      <Gap h={24} />
      <PerleBubble size={60}>Je le note. Je vérifierai ça sur chaque produit que tu scannes.</PerleBubble>
    </StepLayout>
  )
}

// ── A10 : la vérité ──────────────────────────────────────────────────────

/** Les soucis arrivent un par un, comme des messages envoyés, avec un petit tap. */
const SentBubbles = selfAnimated<FC<{ items: typeof CONCERN_OPTIONS }>>(({ items }) => {
  const base = useRevealDelay()
  useEffect(() => {
    const timers = items.map((_, i) => setTimeout(haptic.tick, base + 200 + i * 300))
    return () => timers.forEach(clearTimeout)
  }, [base, items])
  return (
    <View style={styles.sentStack}>
      {items.map((c, i) => (
        <Animated.View
          key={c.key}
          entering={fadeSide('right', base + 120 + i * 300, 420)}
        >
          <View style={[styles.sent, i === items.length - 1 && items.length > 1 && styles.sentFaded]}>
            <ConcernIcon name={c.icon} color={colors.rose} size={22} />
            <Text style={styles.sentText}>{c.mine}</Text>
          </View>
        </Animated.View>
      ))}
    </View>
  )
})

export const TruthStep: FC<StepProps> = ({ draft, next }) => {
  const picked = CONCERN_OPTIONS.filter((c) => draft.concerns.includes(c.key)).slice(0, 3)
  const count = draft.concerns.length
  return (
    <StepLayout footer={<PrimaryButton label="Je veux savoir" onPress={next} />}>
      <Gap h={8} />
      <Eyebrow>LA VÉRITÉ</Eyebrow>
      <Title size={30}>{truthTitle(count).replace('problème. ', 'problème.\n')}</Title>
      <Gap h={16} />
      <Body align="left" style={styles.truthBody}>
        Tu n'as pas une peau compliquée. Tu choisis sur ce qui est écrit devant. Ce qui compte est écrit derrière.
      </Body>
      <Gap h={18} />
      {picked.length > 0 ? <SentBubbles items={picked} /> : null}
      <Gap h={18} />
      <PerleBubble>{truthBubble(count)}</PerleBubble>
    </StepLayout>
  )
}

// ── A13 : 125 ingrédients ────────────────────────────────────────────────
//
// Ordre voulu (28/09/2026), différent de l'ordre de la page :
//   1. le chiffre compte, lentement (~4 s) ;
//   2. « environ » et « ingrédients » arrivent de chaque côté ;
//   3. Perle et sa bulle, au-dessus ;
//   4. la phrase de conclusion, puis le bouton.
// La question « Tu en connais combien ? » et ses noms à toucher ont été
// retirés le 28/09/2026 (jugés inutiles).

const COUNT_START = 250
const COUNT_MS = 4000
const WORDS_AT = COUNT_START + COUNT_MS + 150
const PERLE_AT = WORDS_AT + 650
const CLOSING_AT = PERLE_AT + 800

/** Compte régulier (sinusoïde) : on voit défiler les nombres, sans à-coup ni rebond. */
function useSteadyCount(target: number, start: number, duration: number): number {
  const [value, setValue] = useState(0)
  useEffect(() => {
    let raf = 0
    let t0: number | null = null
    const timer = setTimeout(() => {
      const tick = (now: number) => {
        if (t0 === null) t0 = now
        const t = Math.min(1, (now - t0) / duration)
        const eased = 0.5 - Math.cos(Math.PI * t) / 2
        setValue(Math.round(target * eased))
        if (t < 1) raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    }, start)
    return () => {
      clearTimeout(timer)
      cancelAnimationFrame(raf)
    }
  }, [target, start, duration])
  return value
}

const BigNumber: FC<{ target: number }> = ({ target }) => {
  const shown = useSteadyCount(target, COUNT_START, COUNT_MS)
  const { width } = useWindowDimensions()
  // La ligne « environ 125 ingrédients » doit tenir sur la largeur réelle.
  const inner = Math.min(width, 560) - 40
  const big = Math.max(56, Math.min(104, Math.round(inner * 0.23)))
  const unit = Math.round(big * 0.26)
  const landed = useRef(false)
  useEffect(() => {
    if (landed.current || target <= 0 || shown < target) return
    landed.current = true
    haptic.thud()
  }, [shown, target])
  return (
    <View accessible accessibilityLabel={`Environ ${target} ingrédients par jour`}>
      <View style={styles.bigRow}>
        <Animated.Text
          entering={fadeSide('left', WORDS_AT, 500)}
          style={[styles.bigPre, { fontSize: Math.round(unit * 0.8), marginBottom: big * 0.13 }]}
        >
          environ
        </Animated.Text>
        <Animated.Text
          entering={fade(0, 400)}
          style={[styles.bigNum, { fontSize: big, lineHeight: big * 1.05, minWidth: big * 1.9, textAlign: 'center' }]}
        >
          {shown}
        </Animated.Text>
        <Animated.Text
          entering={fadeSide('right', WORDS_AT, 500)}
          style={[styles.bigUnit, { fontSize: unit, marginBottom: big * 0.11 }]}
        >
          ingrédients
        </Animated.Text>
      </View>
      <Animated.Text entering={fade(WORDS_AT + 250, 500)} style={styles.perDay}>
        par jour
      </Animated.Text>
    </View>
  )
}

export const ProjectionStep: FC<StepProps> = ({ draft, next }) => {
  const target = ingredientsPerDay(draft.productsPerDay ?? 5)
  return (
    <StepLayout
      animate={false}
      footerDelay={CLOSING_AT + 400}
      footer={<PrimaryButton label="Continuer" onPress={next} />}
    >
      <Animated.View entering={fade(PERLE_AT, 500)} style={styles.sparkTop}>
        <Sparkle size={18} color="#FB7185" />
        <Sparkle size={14} color="#FB7185" opacity={0.7} />
      </Animated.View>
      <RevealAt delay={PERLE_AT}>
        <PerleBubble>
          <BubbleText>
            Ça fait environ <Accent>{`${target} ingrédients`}</Accent> sur ta peau, chaque jour.
          </BubbleText>
        </PerleBubble>
      </RevealAt>
      <Gap h={36} />
      <BigNumber target={target} />
      <Gap h={32} />
      <Animated.View entering={fadeUp(CLOSING_AT, 12, 480)}>
        <Text style={styles.footnote}>
          Certains sont très bien. D'autres, moins. Sans les lire, impossible de savoir lesquels.
        </Text>
      </Animated.View>
    </StepLayout>
  )
}

// ── A15 : ton plan peau ──────────────────────────────────────────────────

const CHART_W = 340
const CHART_H = 220
const PINK_PATH = 'M 12 196 C 70 170, 120 160, 165 132 S 240 40, 326 26'
const GREY_PATH = 'M 12 196 C 60 170, 100 150, 140 152 S 240 190, 326 188'
/** Flèche manuscrite de la note vers le bout de la courbe. */
const ARROW_PATH = 'M 192 38 C 224 16, 262 14, 300 26'
const ARROW_HEAD = 'M 288 14 L 302 27 L 285 34'
/** Plus long que les courbes : le trait se dessine de gauche à droite. */
const DASH = 520
const DRAW_MS = 3000
/** Entrée du graphe, en ms depuis l'arrivée sur l'écran. */
const CHART_AT = 200
/** Graphe entièrement posé : courbe tracée, flèche dessinée, notes affichées. */
const CHART_DONE = CHART_AT + 250 + DRAW_MS + 1000

const AnimatedPath = Animated.createAnimatedComponent(Path)

/**
 * La courbe monte en prenant son temps (~3 s), puis le point de fin se pose,
 * la flèche se trace et les deux notes apparaissent. Tout est fini à
 * `base + 250 + DRAW_MS + 1000` (voir `CHART_DONE`).
 */
const PlanChart = selfAnimated<FC<{ tag: string; note: string }>>(({ tag, note }) => {
  const base = useRevealDelay()
  const [fontsLoaded] = useFonts({ Caveat_700Bold })
  const pink = useSharedValue(0)
  const grey = useSharedValue(0)
  const arrow = useSharedValue(0)
  const drawStart = base + 250
  const endAt = drawStart + DRAW_MS
  useEffect(() => {
    const ease = Easing.inOut(Easing.cubic)
    grey.value = withDelay(drawStart - 150, withTiming(1, { duration: DRAW_MS, easing: ease, reduceMotion: RM }))
    pink.value = withDelay(drawStart, withTiming(1, { duration: DRAW_MS, easing: ease, reduceMotion: RM }))
    arrow.value = withDelay(endAt + 350, withTiming(1, { duration: 650, easing: EASE_OUT, reduceMotion: RM }))
    const t = setTimeout(haptic.success, endAt)
    return () => clearTimeout(t)
  }, [drawStart, endAt, pink, grey, arrow])
  const pinkProps = useAnimatedProps(() => ({ strokeDashoffset: DASH * (1 - pink.value) }))
  const greyProps = useAnimatedProps(() => ({ strokeDashoffset: DASH * (1 - grey.value) }))
  const arrowProps = useAnimatedProps(() => ({ strokeDashoffset: 200 * (1 - arrow.value) }))
  const hand = fontsLoaded ? { fontFamily: 'Caveat_700Bold' } : { fontStyle: 'italic' as const }
  return (
    <View
      style={styles.chartWrap}
      accessible
      accessibilityLabel={`Avec CosmeCheck : ${note}, ${tag.toLowerCase()}. Au hasard des rayons, rien ne change.`}
    >
      <Animated.View entering={fade(base, 300)} style={StyleSheet.absoluteFill}>
        <Svg width="100%" height={CHART_H} viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="none">
          <Line x1={0} y1={205} x2={CHART_W} y2={205} stroke={colors.border} strokeWidth={1} />
          <AnimatedPath
            d={GREY_PATH}
            stroke="#C4C9D2"
            strokeWidth={3}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={[DASH, DASH]}
            animatedProps={greyProps}
          />
          <AnimatedPath
            d={PINK_PATH}
            stroke={colors.rose}
            strokeWidth={4}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={[DASH, DASH]}
            animatedProps={pinkProps}
          />
          <Circle cx={12} cy={196} r={6} fill={colors.rose} />
        </Svg>
      </Animated.View>
      {/* Le remplissage rose et le point gris arrivent une fois la courbe tracée. */}
      <Animated.View entering={fade(endAt - 300, 700)} style={StyleSheet.absoluteFill}>
        <Svg width="100%" height={CHART_H} viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="none">
          <Defs>
            <LinearGradient id="pinkFill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.rose} stopOpacity={0.18} />
              <Stop offset="1" stopColor={colors.rose} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Path d={`${PINK_PATH} L 326 205 L 12 205 Z`} fill="url(#pinkFill)" />
          <Circle cx={326} cy={188} r={5} fill="#C4C9D2" />
        </Svg>
      </Animated.View>
      {/* La flèche se trace de la note vers le bout de la courbe. */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg width="100%" height={CHART_H} viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="none">
          <AnimatedPath
            d={ARROW_PATH}
            stroke={colors.rating.orange.DEFAULT}
            strokeWidth={2.5}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={[200, 200]}
            animatedProps={arrowProps}
          />
        </Svg>
      </View>
      <Animated.View entering={fade(endAt + 900, 300)} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg width="100%" height={CHART_H} viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="none">
          <Path
            d={ARROW_HEAD}
            stroke={colors.rating.orange.DEFAULT}
            strokeWidth={2.5}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </Animated.View>
      <Animated.View entering={softScaleIn(endAt, 0.5, 320)} style={styles.endDot} />
      <Animated.Text entering={fadeUp(endAt + 150, 8, 450)} style={styles.chartTag}>
        {tag}
      </Animated.Text>
      {/* L'entrée glisse sur le conteneur : la rotation du texte n'est pas écrasée. */}
      <Animated.View entering={fadeSide('left', endAt + 250, 500)} style={styles.planNoteHost} pointerEvents="none">
        <Text style={[styles.planNote, hand]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
          {note}
        </Text>
      </Animated.View>
    </View>
  )
})

export const PlanStep: FC<StepProps> = ({ draft, next }) => {
  const input = {
    skin: draft.skinTest ?? null,
    concerns: draft.concerns,
    restrictionShorts: restrictionShorts(draft.restrictions),
  }
  const lead = planLead(input)
  const lines = planLines(input)
  const chart = planChartNotes({ productsPerDay: draft.productsPerDay, abandoned: draft.abandoned })
  // Le graphe va jusqu'au bout (courbe, flèche, notes) AVANT que le texte du
  // dessous et le bouton n'apparaissent (demande du 28/09/2026).
  const linesAt = CHART_DONE + 250
  return (
    <StepLayout
      animate={false}
      footerDelay={linesAt + lines.length * 110 + 200}
      footer={<PrimaryButton label="Continuer" onPress={next} />}
    >
      <Gap h={18} />
      <Animated.View entering={fadeUp(0, 14, 450)}>
        <Title align="left" size={32}>
          Ton plan peau{'\n'}commence ici
        </Title>
      </Animated.View>
      <Gap h={8} />
      <RevealAt delay={CHART_AT}>
        <PlanChart tag={chart.tag} note={chart.note} />
      </RevealAt>
      {/* Les axes et la légende font partie du graphe : ils arrivent avec lui. */}
      <Animated.View entering={fade(CHART_AT, 400)}>
        <View style={styles.axis}>
          {["aujourd'hui", 'dans 2 semaines', 'dans 1 mois', 'dans 3 mois'].map((l) => (
            <Text key={l} style={styles.axisLabel}>
              {l}
            </Text>
          ))}
        </View>
        <View style={styles.legend}>
          <View style={[styles.legendDot, { backgroundColor: colors.rose }]} />
          <Text style={styles.legendText}>Avec CosmeCheck</Text>
          <View style={[styles.legendDot, { backgroundColor: '#C4C9D2', marginLeft: 14 }]} />
          <Text style={styles.legendText}>Au hasard des rayons</Text>
        </View>
      </Animated.View>
      <Animated.View entering={fadeUp(CHART_DONE, 12, 450)}>
        <View style={styles.hr} />
        <Text style={styles.lead}>
          {lead.before}
          {lead.skin ? <Text style={styles.leadAccent}>{lead.skin}</Text> : null}
          {lead.middle}
          {lead.concerns ? <Text style={styles.leadAccent}>{lead.concerns}</Text> : null}, dans un mois tu auras :
        </Text>
      </Animated.View>
      <Gap h={14} />
      <RevealAt delay={linesAt}>
        <Cascade from="left" step={110}>
          {lines.map((l) => (
            <View key={l.text} style={styles.planLine}>
              <Ionicons name={l.icon as keyof typeof Ionicons.glyphMap} size={24} color={colors.rose} />
              <Text style={styles.planText}>{l.text}</Text>
            </View>
          ))}
        </Cascade>
      </RevealAt>
    </StepLayout>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 18,
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  cardLabel: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 12,
    letterSpacing: 1.8,
    color: colors.inkMuted,
    marginBottom: 12,
  },
  watchRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10, flexWrap: 'wrap' },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  orangePill: {
    backgroundColor: colors.rating.orange.bg,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  orangePillText: { fontFamily: fontFamilies.bold, fontSize: 15, color: colors.rating.orange.DEFAULT },
  watchWhy: { fontFamily: fontFamilies.regular, fontSize: 15, color: colors.inkMuted, flexShrink: 1 },

  truthBody: { color: colors.inkLight },
  sentStack: { alignItems: 'flex-end', gap: 10 },
  sent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.gray100,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sentFaded: { opacity: 0.75 },
  sentText: { fontFamily: fontFamilies.semiBold, fontSize: 17, color: colors.ink },

  sparkTop: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 60, marginBottom: 6 },
  bigRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', flexWrap: 'wrap', columnGap: 8 },
  bigPre: { fontFamily: fontFamilies.semiBold, fontSize: 20, color: colors.ink, marginBottom: 14 },
  bigNum: { fontFamily: fontFamilies.bold, color: colors.rose, letterSpacing: -3, fontVariant: ['tabular-nums'] },
  bigUnit: { fontFamily: fontFamilies.bold, fontSize: 26, color: colors.rose, marginBottom: 12 },
  perDay: { fontFamily: fontFamilies.semiBold, fontSize: 20, color: colors.inkLight, textAlign: 'center' },
  grayChip: {
    backgroundColor: colors.gray100,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  grayChipText: { fontFamily: fontFamilies.regular, fontSize: 15, color: colors.gray700 },
  footnote: {
    fontFamily: fontFamilies.regular,
    fontSize: 14.5,
    lineHeight: 21,
    color: colors.inkMuted,
    textAlign: 'center',
  },

  chartWrap: { width: '100%', height: CHART_H + 10, marginTop: 6 },
  planNoteHost: { position: 'absolute', top: 22, left: 0, width: '54%' },
  planNote: {
    fontSize: 24,
    lineHeight: 30,
    color: colors.rating.orange.DEFAULT,
    transform: [{ rotate: '-6deg' }],
  },
  endDot: {
    position: 'absolute',
    // 326/340 et 26/220 de la courbe, moins le rayon du point.
    left: '95.9%',
    top: 26 - 9,
    marginLeft: -9,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.rose,
    borderWidth: 2.5,
    borderColor: colors.surface,
  },
  chartTag: {
    position: 'absolute',
    top: -6,
    right: 0,
    fontFamily: fontFamilies.semiBold,
    fontSize: 14,
    lineHeight: 17,
    color: colors.rose,
    textAlign: 'right',
  },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  axisLabel: { fontFamily: fontFamilies.regular, fontSize: 12.5, color: colors.inkLight },
  legend: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 14, flexWrap: 'wrap' },
  legendDot: { width: 12, height: 12, borderRadius: 6, marginRight: 8 },
  legendText: { fontFamily: fontFamilies.regular, fontSize: 14, color: colors.inkMuted },
  hr: { height: 1, backgroundColor: colors.border, marginVertical: 20 },
  lead: { fontFamily: fontFamilies.bold, fontSize: 22, lineHeight: 29, color: colors.ink, letterSpacing: -0.3 },
  leadAccent: { color: colors.rose },
  planLine: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 10 },
  planText: { flex: 1, fontFamily: fontFamilies.regular, fontSize: 16.5, lineHeight: 22, color: colors.ink },
})
