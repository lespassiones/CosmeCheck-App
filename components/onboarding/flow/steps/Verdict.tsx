/**
 * A17 : « La différence ». Ce que dit l'étiquette, ce que dit la formule.
 *
 * Le verdict est composé par `buildQuickVerdict` (pur, testé) à partir de la
 * note du catalogue, du détail de chaque ingrédient, et des réponses. Il ne
 * cite que des ingrédients réellement présents, et sait aussi dire « bonne
 * pioche » : une app qui ne dit que du mal ne serait pas crue.
 */

import { useEffect, useMemo, useRef, useState, type FC } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { Image } from 'expo-image'
import { Ionicons } from '@expo/vector-icons'
import Animated, { FadeIn } from 'react-native-reanimated'
import Svg, { Path } from 'react-native-svg'

import { colors } from '@/constants/colors'
import { fontFamilies } from '@/constants/typography'
import { matchIngredients } from '@/lib/onboarding/productLookup'
import { haptic } from '@/lib/haptics'
import { fadeUp } from '@/components/onboarding/flow/motion'
import { Star3D } from '@/components/analysis/Star3D'
import { STARS_BY_TONE, STAR_PALETTE_BY_TONE, STAR_EMPTY_PALETTE } from '@/lib/analysis/qualityStars'
import {
  buildQuickVerdict,
  type MatchedIngredient,
  type QuickVerdict,
  type VerdictTone,
} from '@/lib/onboarding/verdict'
import {
  Eyebrow,
  Gap,
  PerleBubble,
  PrimaryButton,
  StepLayout,
  Title,
} from '@/components/onboarding/flow/ui'
import type { StepProps } from '@/components/onboarding/flow/types'

const TONE_COLORS: Record<VerdictTone, { fg: string; bg: string }> = {
  vert: { fg: colors.rating.vert.DEFAULT, bg: colors.rating.vert.bg },
  jaune: { fg: colors.rating.jaune.DEFAULT, bg: colors.rating.jaune.bg },
  orange: { fg: colors.rating.orange.DEFAULT, bg: colors.rating.orange.bg },
  rouge: { fg: colors.rating.rouge.DEFAULT, bg: colors.rating.rouge.bg },
}

const SEG = 12

/**
 * Répartit 12 segments entre vert, jaune, orange et rouge, au prorata des
 * ingrédients reconnus (plus fort reste). Une couleur présente a toujours au
 * moins un segment : un seul ingrédient rouge doit se voir.
 */
function segmentColors(counts: QuickVerdict['counts']): string[] {
  const parts: [number, string][] = [
    [counts.vert, colors.halfDonut.vert],
    [counts.jaune, colors.halfDonut.jaune],
    [counts.orange, colors.halfDonut.orange],
    [counts.rouge, colors.halfDonut.rouge],
  ]
  const known = parts.reduce((s, [n]) => s + n, 0)
  if (known === 0) return Array.from({ length: SEG }, () => colors.halfDonut.empty)
  const raw = parts.map(([n]) => (n / known) * SEG)
  const alloc = raw.map((r, i) => (parts[i][0] > 0 ? Math.max(1, Math.floor(r)) : 0))
  let sum = alloc.reduce((s, n) => s + n, 0)
  while (sum < SEG) {
    let best = 0
    for (let i = 1; i < 4; i += 1) if (raw[i] - alloc[i] > raw[best] - alloc[best]) best = i
    alloc[best] += 1
    sum += 1
  }
  while (sum > SEG) {
    let best = 0
    for (let i = 1; i < 4; i += 1) if (alloc[i] > alloc[best]) best = i
    alloc[best] -= 1
    sum -= 1
  }
  return parts.flatMap(([, c], i) => Array.from({ length: alloc[i] }, () => c))
}

/** Demi-jauge en segments, de gauche (vert) à droite (rouge). */
const SegmentGauge: FC<{ counts: QuickVerdict['counts']; size?: number }> = ({ counts, size = 96 }) => {
  const palette = segmentColors(counts)
  const r = size / 2 - 8
  const cx = size / 2
  const cy = size / 2
  const gap = 0.05
  const arcs = Array.from({ length: SEG }, (_, i) => {
    const a0 = Math.PI - (i / SEG) * Math.PI - gap / 2
    const a1 = Math.PI - ((i + 1) / SEG) * Math.PI + gap / 2
    const x0 = cx + r * Math.cos(a0)
    const y0 = cy - r * Math.sin(a0)
    const x1 = cx + r * Math.cos(a1)
    const y1 = cy - r * Math.sin(a1)
    return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`
  })
  return (
    <View style={{ width: size, alignItems: 'center' }} accessible accessibilityLabel={`${counts.total} ingrédients`}>
      <Svg width={size} height={size / 2 + 6} viewBox={`0 0 ${size} ${size / 2 + 6}`}>
        {arcs.map((d, i) => (
          <Path key={i} d={d} stroke={palette[i]} strokeWidth={9} strokeLinecap="round" fill="none" />
        ))}
      </Svg>
      <Text style={styles.gaugeNum}>{counts.total}</Text>
      <Text style={styles.gaugeLabel}>ingrédients</Text>
    </View>
  )
}

export const VerdictStep: FC<StepProps> = ({ draft, next }) => {
  const p = draft.scanned
  const [matches, setMatches] = useState<MatchedIngredient[] | null>(null)
  const [count, setCount] = useState(0)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!p) return
    let alive = true
    void (async () => {
      // Une seconde tentative : sur base froide, le premier appel peut expirer.
      let r = await matchIngredients(p.ingredientsText)
      if (!r.ok) r = await matchIngredients(p.ingredientsText)
      if (!alive) return
      setFailed(!r.ok)
      setMatches(r.matches)
      setCount(r.count)
    })()
    return () => {
      alive = false
    }
  }, [p])

  const verdict = useMemo(() => {
    if (!p || matches === null) return null
    return buildQuickVerdict({
      productName: p.name,
      score: p.score,
      scoreLabel: p.scoreLabel,
      ingredientCount: count,
      matches,
      skin: draft.skinTest ?? null,
      restrictions: draft.restrictions,
      avoidIngredients: draft.restrictionIngredients,
      sensitive: draft.skinSensitive,
      personalized: draft.consent?.granted === true,
    })
  }, [
    p,
    matches,
    count,
    draft.skinTest,
    draft.skinSensitive,
    draft.restrictions,
    draft.restrictionIngredients,
    draft.consent?.granted,
  ])

  // Le verdict tombe : une alerte se sent (avertissement), une bonne pioche aussi (réussite).
  const felt = useRef(false)
  useEffect(() => {
    if (!verdict || felt.current) return
    felt.current = true
    const t = setTimeout(verdict.alerts.length > 0 ? haptic.warning : haptic.success, 380)
    return () => clearTimeout(t)
  }, [verdict])

  if (!p) return null

  const clean = verdict?.kind === 'clean' && !failed
  // Sans consentement, Perle ne connaît pas la peau : elle juge la formule,
  // jamais « ce produit te convient ».
  const personalized = draft.consent?.granted === true
  const bubble = !verdict
    ? null
    : failed
      ? "Je n'ai pas pu lire sa liste en détail cette fois. Tu le retrouveras analysé dans l'app."
      : verdict.kind === 'alerts'
        ? personalized
          ? "Voilà ce que personne ne t'avait dit sur ce produit."
          : 'Voilà ce que sa formule cache. Complète ton profil beauté pour une lecture faite pour ta peau.'
        : clean
          ? personalized
            ? 'Ce produit te convient. Tu vois, je ne dis pas que du mal des produits.'
            : "Sa formule est plutôt propre. Complète ton profil beauté et je te dirai s'il convient à ta peau."
          : personalized
            ? "Rien de ce que tu évites, mais sa formule reste moyenne. Je t'aiderai à trouver mieux."
            : "Rien d'alarmant, mais sa formule reste moyenne. Je t'aiderai à trouver mieux."
  const title = clean
    ? personalized
      ? 'Bonne pioche !'
      : 'Plutôt une bonne formule.'
    : "Ce que dit l'étiquette.\nCe que dit la formule."

  return (
    <StepLayout footer={<PrimaryButton label="Continuer" onPress={next} disabled={!verdict} />}>
      <Eyebrow>LA DIFFÉRENCE</Eyebrow>
      <Title size={28}>{title}</Title>
      <Gap h={18} />

      {verdict && verdict.claims.length > 0 ? (
        <Animated.View entering={FadeIn.duration(300)}>
          <Text style={styles.label}>DEVANT DU FLACON</Text>
          <View style={styles.claims}>
            {verdict.claims.map((c) => (
              <View key={c} style={styles.claim}>
                <Text style={styles.claimText}>{c}</Text>
              </View>
            ))}
          </View>
          <Ionicons name="arrow-down" size={22} color={colors.inkLight} style={styles.arrow} />
        </Animated.View>
      ) : null}

      <Text style={[styles.label, styles.labelRose]}>CE QUE JE VOIS POUR TOI</Text>
      <View style={styles.card}>
        <View style={styles.head}>
          <View style={styles.thumb}>
            {p.imageUrl ? (
              <Image source={{ uri: p.imageUrl }} style={styles.thumbImg} contentFit="contain" cachePolicy="memory-disk" />
            ) : (
              <Ionicons name="flask-outline" size={26} color={colors.inkLight} />
            )}
          </View>
          <View style={styles.headTexts}>
            {p.brand ? <Text style={styles.brand} numberOfLines={1}>{p.brand}</Text> : null}
            <Text style={styles.name} numberOfLines={3}>{p.name}</Text>
            {verdict?.scoreLabel && verdict.tone ? (
              <View style={styles.scoreRow} accessible accessibilityLabel={`Qualité de la composition : ${verdict.scoreLabel}`}>
                <View style={styles.stars}>
                  {[0, 1, 2, 3, 4].map((i) => (
                    <Star3D
                      key={i}
                      gradientId={`onb-star-${i}`}
                      size={17}
                      palette={
                        i < STARS_BY_TONE[verdict.starTone]
                          ? STAR_PALETTE_BY_TONE[verdict.starTone]
                          : STAR_EMPTY_PALETTE
                      }
                    />
                  ))}
                </View>
                <View style={[styles.scorePill, { backgroundColor: TONE_COLORS[verdict.tone].bg }]}>
                  <Text style={[styles.scoreText, { color: TONE_COLORS[verdict.tone].fg }]}>{verdict.scoreLabel}</Text>
                </View>
              </View>
            ) : null}
          </View>
          {verdict ? <SegmentGauge counts={verdict.counts} /> : null}
        </View>

        {!verdict ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.rose} />
            <Text style={styles.loadingText}>Je lis sa liste d'ingrédients…</Text>
          </View>
        ) : (
          <>
            {verdict.alerts.map((a) => (
              <Animated.View key={a.title} entering={fadeUp(0, 12, 360)} style={styles.line}>
                <Ionicons name="warning-outline" size={26} color={colors.rating.orange.DEFAULT} />
                <View style={styles.lineTexts}>
                  <Text style={styles.lineTitle}>{a.title}</Text>
                  <Text style={styles.lineDetail}>{a.detail}</Text>
                </View>
              </Animated.View>
            ))}
            {verdict.positives.map((a) => (
              <Animated.View key={a.title} entering={fadeUp(160, 12, 360)} style={styles.line}>
                <Ionicons name="checkmark-circle-outline" size={26} color={colors.success} />
                <View style={styles.lineTexts}>
                  <Text style={styles.lineTitle}>{a.title}</Text>
                  <Text style={styles.lineDetail}>{a.detail}</Text>
                </View>
              </Animated.View>
            ))}
            {failed ? (
              <View style={styles.line}>
                <Ionicons name="cloud-offline-outline" size={26} color={colors.inkMuted} />
                <View style={styles.lineTexts}>
                  <Text style={styles.lineTitle}>Lecture détaillée indisponible</Text>
                  <Text style={styles.lineDetail}>La connexion a coupé pendant que je lisais sa liste.</Text>
                </View>
              </View>
            ) : verdict.alerts.length === 0 && verdict.positives.length === 0 ? (
              <View style={styles.line}>
                <Ionicons name="information-circle-outline" size={26} color={colors.inkMuted} />
                <View style={styles.lineTexts}>
                  <Text style={styles.lineTitle}>Rien à signaler pour toi</Text>
                  <Text style={styles.lineDetail}>Aucun des ingrédients que tu évites.</Text>
                </View>
              </View>
            ) : null}
          </>
        )}
      </View>
      <Gap h={20} />
      {bubble ? (
        <Animated.View entering={FadeIn.delay(250).duration(300)}>
          <PerleBubble size={60}>{bubble}</PerleBubble>
        </Animated.View>
      ) : null}
    </StepLayout>
  )
}

const styles = StyleSheet.create({
  label: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 12.5,
    letterSpacing: 2,
    color: colors.inkMuted,
    marginBottom: 10,
  },
  labelRose: { color: colors.rose },
  claims: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    backgroundColor: colors.gray100,
    borderRadius: 18,
    padding: 12,
  },
  claim: {
    borderWidth: 1,
    borderColor: colors.gray300,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.gray50,
  },
  claimText: { fontFamily: fontFamilies.regular, fontSize: 14.5, color: colors.inkMuted },
  arrow: { alignSelf: 'center', marginVertical: 10 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.rose,
    padding: 16,
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingBottom: 12 },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: 14,
    backgroundColor: colors.roseSoft,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbImg: { width: 58, height: 58 },
  headTexts: { flex: 1, gap: 3 },
  brand: { fontFamily: fontFamilies.regular, fontSize: 13, color: colors.inkMuted },
  name: { fontFamily: fontFamilies.semiBold, fontSize: 16, lineHeight: 21, color: colors.ink },
  scoreRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  stars: { flexDirection: 'row', gap: 1 },
  scorePill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  scoreText: { fontFamily: fontFamilies.bold, fontSize: 13.5 },
  gaugeNum: { fontFamily: fontFamilies.bold, fontSize: 22, color: colors.ink, marginTop: -24 },
  gaugeLabel: { fontFamily: fontFamilies.regular, fontSize: 11.5, color: colors.inkMuted },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 16, borderTopWidth: 1, borderTopColor: colors.border },
  loadingText: { fontFamily: fontFamilies.regular, fontSize: 15, color: colors.inkMuted },
  line: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  lineTexts: { flex: 1, gap: 3 },
  lineTitle: { fontFamily: fontFamilies.semiBold, fontSize: 15.5, lineHeight: 21, color: colors.ink },
  lineDetail: { fontFamily: fontFamilies.regular, fontSize: 14, lineHeight: 19, color: colors.inkMuted },
})
