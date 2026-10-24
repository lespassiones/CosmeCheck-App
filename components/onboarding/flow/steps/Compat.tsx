/**
 * « Ton score de compatibilité » : après le montage, juste avant le paywall.
 *
 * Le profil est complet (peau, soucis, objectifs, cheveux, ingrédients à
 * éviter) : on rend le produit scanné noté POUR la personne. L'anneau se
 * remplit et le chiffre compte, puis seuls les bons points arrivent un par un,
 * et Perle conclut sur ce qui fait CosmeCheck : un score personnel.
 *
 * Calcul : `buildOnboardingCompat` (pur, testé), même moteur que l'app.
 */

import { useEffect, useMemo, useState, type FC } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { Image } from 'expo-image'
import { Ionicons } from '@expo/vector-icons'
import Animated, { Easing, useAnimatedProps, useSharedValue, withDelay, withTiming } from 'react-native-reanimated'
import Svg, { Circle } from 'react-native-svg'

import { colors } from '@/constants/colors'
import { fontFamilies } from '@/constants/typography'
import { useCountUp } from '@/components/design/motion'
import { haptic } from '@/lib/haptics'
import { buildOnboardingCompat, type OnboardingCompat } from '@/lib/onboarding/compat'
import { matchIngredients } from '@/lib/onboarding/productLookup'
import { prefetchGoalsCoverage } from '@/lib/onboarding/goalsCoverageFetch'
import type { MatchedIngredient } from '@/lib/onboarding/verdict'
import { RM, fade, fadeUp, softScaleIn } from '@/components/onboarding/flow/motion'
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

const TONE: Record<OnboardingCompat['tone'], { fg: string; bg: string }> = {
  vert: { fg: colors.rating.vert.DEFAULT, bg: colors.rating.vert.bg },
  jaune: { fg: colors.rating.jaune.DEFAULT, bg: colors.rating.jaune.bg },
  orange: { fg: colors.rating.orange.DEFAULT, bg: colors.rating.orange.bg },
  rouge: { fg: colors.rating.rouge.DEFAULT, bg: colors.rating.rouge.bg },
}

// Déroulé, en ms depuis l'arrivée sur l'écran.
const PRODUCT_AT = 350
const RING_AT = 650
const FILL_MS = 1600
const RING_DONE = RING_AT + FILL_MS
const POINTS_AT = RING_DONE + 350
const POINT_STEP = 160

const AnimatedCircle = Animated.createAnimatedComponent(Circle)

/** Anneau qui se remplit de 0 au score pendant que le chiffre compte. */
const ScoreRing: FC<{ score: number; tone: OnboardingCompat['tone'] }> = ({ score, tone }) => {
  const fit = useFit()
  const size = fitSize(172, fit)
  const stroke = Math.max(10, fitSize(14, fit))
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const progress = useSharedValue(0)
  const shown = useCountUp(score, score, FILL_MS, RING_AT)
  useEffect(() => {
    progress.value = withDelay(
      RING_AT,
      withTiming(score / 100, { duration: FILL_MS, easing: Easing.out(Easing.cubic), reduceMotion: RM }),
    )
    const t = setTimeout(haptic.success, RING_DONE)
    return () => clearTimeout(t)
  }, [progress, score])
  const arc = useAnimatedProps(() => ({ strokeDashoffset: c * (1 - progress.value) }))
  const num = fitFont(50, fit)
  return (
    <Animated.View
      entering={softScaleIn(RING_AT - 150, 0.92, 420)}
      style={[styles.ring, { width: size, height: size }]}
      accessible
      accessibilityLabel={`Score de compatibilité : ${score} sur 100`}
    >
      <Svg width={size} height={size} style={styles.ringSvg}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.gray200} strokeWidth={stroke} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={TONE[tone].fg}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={[c, c]}
          animatedProps={arc}
        />
      </Svg>
      <View style={styles.ringCenter}>
        <Text style={[styles.ringNum, { fontSize: num, lineHeight: Math.round(num * 1.1) }]}>
          {shown}
          <Text style={[styles.ringPct, { fontSize: Math.round(num * 0.42) }]}> %</Text>
        </Text>
      </View>
    </Animated.View>
  )
}

const GoodPoint: FC<{ text: string; delay: number }> = ({ text, delay }) => {
  const fit = useFit()
  const size = fitFont(15.5, fit)
  return (
    <Animated.View entering={fadeUp(delay, 12, 420)} style={[styles.point, { paddingVertical: fitSize(7, fit) }]}>
      <View style={styles.pointDot}>
        <Ionicons name="checkmark" size={14} color={colors.surface} />
      </View>
      <Text style={[styles.pointText, { fontSize: size, lineHeight: Math.round(size * 1.35) }]}>{text}</Text>
    </Animated.View>
  )
}

export const CompatStep: FC<StepProps> = ({ draft, next, firstName }) => {
  const p = draft.scanned
  const [read, setRead] = useState<{ matches: MatchedIngredient[]; count: number; ok: boolean } | null>(null)

  // L'écran suivant (couverture des objectifs) se prépare pendant celui-ci.
  useEffect(() => {
    if (p && (draft.consent?.granted === true)) prefetchGoalsCoverage(draft)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!p) return
    let alive = true
    void (async () => {
      // Déjà lue au verdict : réponse immédiate (cache), sinon une relance.
      let r = await matchIngredients(p.ingredientsText)
      if (!r.ok) r = await matchIngredients(p.ingredientsText)
      if (alive) setRead(r)
    })()
    return () => {
      alive = false
    }
  }, [p])

  const compat = useMemo(() => {
    if (!p || !read) return null
    // Liste illisible : on ne cite rien, le score est celui de la formule seule.
    const usable = read.ok
    return buildOnboardingCompat({
      productName: p.name,
      score: p.score,
      scoreLabel: p.scoreLabel,
      ingredientCount: read.count,
      matches: usable ? read.matches : [],
      skin: draft.skinTest ?? null,
      restrictions: draft.restrictions,
      avoidIngredients: draft.restrictionIngredients,
      sensitive: draft.skinSensitive,
      goals: draft.goals,
      personalized: usable && draft.consent?.granted === true,
    })
  }, [p, read, draft.skinTest, draft.restrictions, draft.restrictionIngredients, draft.skinSensitive, draft.goals, draft.consent?.granted])

  if (!p) return null

  if (!compat) {
    return (
      <StepLayout key="lecture" footer={<PrimaryButton label="Continuer" onPress={next} disabled />}>
        <Gap h={16} />
        <PerleBubble>Je calcule ton score de compatibilité…</PerleBubble>
        <Gap h={40} />
        <ActivityIndicator color={colors.rose} size="large" />
      </StepLayout>
    )
  }

  const who = firstName ? `, ${firstName}` : ''
  const points = compat.goodPoints
  const closingAt = POINTS_AT + points.length * POINT_STEP + 300
  const tone = TONE[compat.tone]

  return (
    <StepLayout
      key="score"
      animate={false}
      footerDelay={closingAt + 500}
      footer={<PrimaryButton label="Continuer" onPress={next} />}
    >
      <Gap h={14} />
      <RevealAt delay={0}>
        <PerleBubble>
          {compat.personal
            ? `Voilà le plus important${who} : ton score de compatibilité.`
            : `Voilà le score de sa formule${who}.`}
        </PerleBubble>
      </RevealAt>
      <Gap h={20} />
      <Animated.View entering={fadeUp(PRODUCT_AT, 10, 400)} style={styles.product}>
        {p.imageUrl ? (
          <Image source={{ uri: p.imageUrl }} style={styles.productImage} contentFit="cover" cachePolicy="memory-disk" />
        ) : null}
        <View style={styles.productTexts}>
          {p.brand ? (
            <Text style={styles.productBrand} numberOfLines={1}>
              {p.brand}
            </Text>
          ) : null}
          <Text style={styles.productName} numberOfLines={1}>
            {p.name}
          </Text>
        </View>
      </Animated.View>
      <Gap h={18} />
      <ScoreRing score={compat.score} tone={compat.tone} />
      <Gap h={12} />
      <Animated.View entering={fade(RING_DONE - 100, 400)} style={styles.labelRow}>
        <View style={[styles.labelChip, { backgroundColor: tone.bg }]}>
          <Text style={[styles.labelText, { color: tone.fg }]}>{compat.label}</Text>
        </View>
      </Animated.View>
      {points.length > 0 ? (
        <>
          <Gap h={22} />
          <Animated.View entering={fade(POINTS_AT - 150, 350)}>
            <Eyebrow align="left" color={colors.inkMuted}>
              {compat.personal ? 'CE QUI VA BIEN POUR TOI' : 'CE QUI VA BIEN'}
            </Eyebrow>
          </Animated.View>
          {points.map((t, i) => (
            <GoodPoint key={t} text={t} delay={POINTS_AT + i * POINT_STEP} />
          ))}
        </>
      ) : null}
      <Gap h={22} />
      <Animated.View entering={fadeUp(closingAt, 10, 480)}>
        <Text style={styles.closing}>
          {compat.personal ? (
            <>
              Ce score n'existe que pour toi : il dépend de ta peau, de tes objectifs et de ce que tu évites. C'est ça,{' '}
              <Text style={styles.brand}>CosmeCheck</Text>.
            </>
          ) : (
            <>
              Avec ton profil, <Text style={styles.brand}>CosmeCheck</Text> calcule ce score pour ta peau à toi.
            </>
          )}
        </Text>
      </Animated.View>
    </StepLayout>
  )
}

const styles = StyleSheet.create({
  product: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  productImage: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.gray100 },
  productTexts: { flexShrink: 1, alignItems: 'flex-start' },
  productBrand: { fontFamily: fontFamilies.regular, fontSize: 13, color: colors.inkMuted },
  productName: { fontFamily: fontFamilies.semiBold, fontSize: 15.5, color: colors.ink },
  ring: { alignSelf: 'center', alignItems: 'center', justifyContent: 'center' },
  ringSvg: { position: 'absolute', transform: [{ rotate: '-90deg' }] },
  ringCenter: { alignItems: 'center', justifyContent: 'center' },
  ringNum: { fontFamily: fontFamilies.bold, color: colors.ink, letterSpacing: -1.5, fontVariant: ['tabular-nums'] },
  ringPct: { fontFamily: fontFamilies.semiBold, color: colors.inkMuted, letterSpacing: 0 },
  labelRow: { alignItems: 'center' },
  labelChip: { borderRadius: 999, paddingHorizontal: 16, paddingVertical: 7 },
  labelText: { fontFamily: fontFamilies.semiBold, fontSize: 15 },
  point: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pointDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.rating.vert.DEFAULT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pointText: { flex: 1, fontFamily: fontFamilies.medium, color: colors.ink },
  closing: {
    fontFamily: fontFamilies.regular,
    fontSize: 15,
    lineHeight: 22,
    color: colors.inkMuted,
    textAlign: 'center',
  },
  brand: { fontFamily: fontFamilies.bold, color: colors.rose },
})
