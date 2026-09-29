/**
 * A1 et A2 : les deux écrans d'accroche du parcours invité.
 *
 * Leçon du refus Apple du 31/08/2026 (guideline 4, iPad en fenêtre de
 * compatibilité) : rien ne doit être rogné ni recouvert. Les illustrations sont
 * donc en `contain` dans une zone flexible, la barre du bas occupe sa propre
 * place dans le flux, et tout l'écran défile si la fenêtre est trop courte.
 *
 * Petits écrans (iPhone SE, 375 × 667) : l'illustration rétrécit d'abord pour
 * que tout tienne au-dessus du bouton sans défiler (règle du parcours du
 * 29/09/2026, cf. StepLayout) ; le défilement ne reste qu'en dernier recours.
 */

import { useCallback, useEffect, useRef, useState, type FC } from 'react'
import { ScrollView, StyleSheet, Text, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native'
import { Image } from 'expo-image'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Path } from 'react-native-svg'

import { colors } from '@/constants/colors'
import { fontFamilies } from '@/constants/typography'
import { CATALOG_SIZE_LABEL } from '@/lib/onboarding/content'
import { FLOW_MAX_WIDTH, GUTTER, PrimaryButton } from '@/components/onboarding/flow/ui'
import { Sparkle } from '@/components/onboarding/flow/icons'
import { fade, fadeSide, fadeUp, softScaleIn } from '@/components/onboarding/flow/motion'

const COLLAGE = require('../../../../assets/images/onboarding/labels-collage.webp')
const PERLE = require('../../../../assets/images/onboarding/perle.webp')
const LAUREL_L = require('../../../../assets/images/onboarding/laurel-left.webp')
const LAUREL_R = require('../../../../assets/images/onboarding/laurel-right.webp')

const COLLAGE_RATIO = 851 / 625
const COLLAGE_MAX_H = 340
const STAGE_MAX_H = 360
// Perle occupe 52 % de la largeur de la scène (taille naturelle).
const PERLE_WIDTH_SHARE = 0.52
const PERLE_RATIO = 720 / 836

interface HookProps {
  onStart: () => void
  onSignIn: () => void
  /** Écran figé sous la feuille de consentement : pas d'interaction. */
  inert?: boolean
}

// Marges verticales de `styles.scroll`, comptées dans la place à trouver.
const SCROLL_PAD_V = 24 + 12

/**
 * Hauteur de l'illustration qui fait tenir l'écran sans défiler. Mesuré, pas
 * deviné, en deux temps :
 *   1. `live = false` : maquette INVISIBLE et IMMOBILE (aucune entrée animée,
 *      aucune boucle) à la taille naturelle, pour mesurer zone visible + colonne ;
 *   2. `live = true` : le vrai écran animé, monté une seule fois, déjà à la
 *      bonne taille.
 * Pourquoi : sur Android (Reanimated 4), un bloc qui change de place pendant son
 * entrée garde son ancienne position, et démonter un bloc dont une animation
 * tourne (étiquettes flottantes) a fait planter l'app en release (écran blanc,
 * « Unable to find viewState », 29/09/2026). La maquette, elle, n'anime rien.
 */
function useIllustrationFit(natural: number, min: number) {
  const [fit, setFit] = useState({ shrink: 0, live: false })
  const m = useRef({ viewport: 0, column: 0, done: false })
  const reveal = useCallback((shrink: number) => {
    if (m.current.done) return
    m.current.done = true
    setFit({ shrink, live: true })
  }, [])
  const decide = useCallback(() => {
    const { viewport, column } = m.current
    if (viewport <= 0 || column <= 0) return
    reveal(Math.max(0, Math.ceil(column + SCROLL_PAD_V - viewport)))
  }, [reveal])
  // Filet : quoi qu'il arrive (mesure absente), on montre.
  useEffect(() => {
    const t = setTimeout(() => reveal(0), 600)
    return () => clearTimeout(t)
  }, [reveal])
  const onViewportLayout = useCallback(
    (e: LayoutChangeEvent) => {
      m.current.viewport = e.nativeEvent.layout.height
      decide()
    },
    [decide],
  )
  const onColumnLayout = useCallback(
    (e: LayoutChangeEvent) => {
      m.current.column = e.nativeEvent.layout.height
      decide()
    },
    [decide],
  )
  const live = fit.live
  return {
    size: Math.max(Math.min(min, natural), natural - fit.shrink),
    live,
    onViewportLayout,
    onColumnLayout,
    /** Entrée animée du vrai écran ; aucune sur la maquette de mesure. */
    enter: <T,>(animation: T): T | undefined => (live ? animation : undefined),
    /** Colonne : maquette invisible mesurée, puis vrai écran monté une fois. */
    columnKey: live ? 'live' : 'probe',
    columnProps: {
      style: [styles.column, !live && styles.hidden],
      onLayout: live ? undefined : onColumnLayout,
    },
  }
}

const Dots: FC<{ active: 0 | 1 }> = ({ active }) => (
  <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <View style={[styles.dot, active === 0 && styles.dotOn]} />
    <View style={[styles.dot, active === 1 && styles.dotOn]} />
  </View>
)

const Footer: FC<HookProps & { active: 0 | 1 }> = ({ onStart, onSignIn, active }) => {
  const insets = useSafeAreaInsets()
  return (
    <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) + 4 }]}>
      <View style={styles.column}>
        <Dots active={active} />
        <PrimaryButton label="Commencer" onPress={onStart} />
        <Text style={styles.signin}>
          Tu as déjà un compte ?{' '}
          <Text style={styles.signinLink} onPress={onSignIn} accessibilityRole="link">
            Se connecter
          </Text>
        </Text>
      </View>
    </View>
  )
}

// ── A1 : le devant, le dos ───────────────────────────────────────────────

export const HookFront: FC<HookProps> = (props) => {
  const { width } = useWindowDimensions()
  // Trois lignes : « Tu lis le devant du flacon. » doit tenir sur la première.
  // Environ 0,44 em par caractère en Inter Bold serré, 27 caractères.
  const column = Math.min(width, FLOW_MAX_WIDTH) - GUTTER * 2
  const titleSize = Math.min(34, Math.floor(column / (27 * 0.44)))
  const fit = useIllustrationFit(Math.min(COLLAGE_MAX_H, column / COLLAGE_RATIO), 140)
  return (
    <View style={styles.flex} pointerEvents={props.inert ? 'none' : 'auto'}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        onLayout={fit.onViewportLayout}
      >
        <View key={fit.columnKey} {...fit.columnProps}>
          <View accessible accessibilityRole="header" accessibilityLabel="Tu lis le devant du flacon. Ta peau, elle, reçoit le dos.">
            <Animated.Text
              entering={fit.enter(fadeUp(80, 18, 520))}
              style={[styles.hookTitle, { fontSize: titleSize, lineHeight: titleSize * 1.15 }]}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              Tu lis le devant du flacon.{'\n'}Ta peau, elle,
            </Animated.Text>
            {/* « reçoit le dos. » posé sur un bloc vert pastel incliné, comme un surligneur. */}
            <Animated.View entering={fit.enter(softScaleIn(620, 0.9, 420))} style={styles.highlightWrap}>
              <View style={styles.highlight}>
                <Text style={[styles.highlightText, { fontSize: titleSize, lineHeight: titleSize * 1.2 }]}>
                  reçoit le dos.
                </Text>
              </View>
            </Animated.View>
          </View>
          <Animated.View entering={fit.enter(fade(1000, 400))}>
            <Ionicons name="arrow-down" size={28} color={colors.ink} style={styles.arrow} />
          </Animated.View>
          <Animated.View entering={fit.enter(fadeUp(1150, 20, 560))}>
            <Image
              source={COLLAGE}
              style={[styles.collage, { height: fit.size }]}
              contentFit="contain"
              accessibilityLabel="Des étiquettes « 100 % naturel », « Hypoallergénique » et « Testé sous contrôle dermatologique », et au dos une liste d'ingrédients où le parfum est surligné"
            />
          </Animated.View>
          <Animated.View entering={fit.enter(fade(1600, 500))} style={styles.proof}>
            <Image source={LAUREL_L} style={styles.laurel} contentFit="contain" />
            <View style={styles.proofCol}>
              <Text style={styles.proofNum} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                {CATALOG_SIZE_LABEL}
              </Text>
              <Text style={styles.proofLabel}>produits décryptés</Text>
            </View>
            <View style={styles.proofSep} />
            <View style={styles.proofCol}>
              <Text style={styles.proofNum}>4 couleurs</Text>
              <Text style={styles.proofLabel}>pour chaque ingrédient</Text>
            </View>
            <Image source={LAUREL_R} style={styles.laurel} contentFit="contain" />
          </Animated.View>
        </View>
      </ScrollView>
      <Footer {...props} active={0} />
    </View>
  )
}

// ── A2 : la traductrice ──────────────────────────────────────────────────

const FLOAT_CARDS = [
  { title: 'Niacinamide', sub: 'Top pour tes pores', tone: 'vert', style: { top: '4%', left: '0%' }, rotate: '-8deg' },
  { title: 'Parfum', sub: 'À éviter pour toi', tone: 'orange', style: { top: '2%', right: '0%' }, rotate: '7deg' },
  { title: 'Alcohol denat.', sub: 'Asséchant', tone: 'orange', style: { top: '52%', left: '-2%' }, rotate: '6deg' },
  { title: 'Glycerin', sub: 'Hydratant', tone: 'vert', style: { top: '60%', right: '0%' }, rotate: '-7deg' },
] as const

const FloatCard: FC<{ index: number; live: boolean } & (typeof FLOAT_CARDS)[number]> = ({
  index,
  live,
  title,
  sub,
  tone,
  style,
  rotate,
}) => {
  const y = useSharedValue(0)
  useEffect(() => {
    // Maquette de mesure : aucune boucle (voir useIllustrationFit).
    if (!live) return
    y.value = withDelay(
      index * 350,
      withRepeat(
        withSequence(
          withTiming(-5, { duration: 1800, easing: Easing.inOut(Easing.quad), reduceMotion: ReduceMotion.System }),
          withTiming(0, { duration: 1800, easing: Easing.inOut(Easing.quad), reduceMotion: ReduceMotion.System }),
        ),
        -1,
      ),
    )
  }, [index, live, y])
  const anim = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }, { rotate }] }))
  const vert = tone === 'vert'
  return (
    <Animated.View
      entering={live ? fadeUp(450 + index * 160, 12, 460) : undefined}
      style={[styles.floatHost, style as object]}
    >
      <Animated.View
        style={[
          styles.floatCard,
          { backgroundColor: vert ? colors.rating.vert.bg : colors.rating.orange.bg },
          anim,
        ]}
      >
        <View style={[styles.floatDot, { backgroundColor: vert ? colors.success : colors.rating.orange.DEFAULT }]} />
        <Text style={styles.floatTitle}>{title}</Text>
        <Text style={styles.floatSub}>{sub}</Text>
      </Animated.View>
    </Animated.View>
  )
}

export const HookTranslator: FC<HookProps> = (props) => {
  const { width } = useWindowDimensions()
  const titleSize = width < 360 ? 30 : 34
  const column = Math.min(width, FLOW_MAX_WIDTH) - GUTTER * 2
  const natural = Math.min(STAGE_MAX_H, column)
  const fit = useIllustrationFit(natural, 180)
  // Scène raccourcie : Perle rétrécit dans la même proportion, les étiquettes
  // gardent leur place relative (positions en %).
  const perleWidth = column * PERLE_WIDTH_SHARE * (fit.size / natural)
  return (
    <View style={styles.flex} pointerEvents={props.inert ? 'none' : 'auto'}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        onLayout={fit.onViewportLayout}
      >
        <View key={fit.columnKey} {...fit.columnProps}>
          <View
            style={[styles.stage, { height: fit.size }]}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Animated.View entering={fit.enter(softScaleIn(80, 0.9, 520))} style={styles.perleWrap}>
              <Image source={PERLE} style={[styles.perle, { width: perleWidth }]} contentFit="contain" />
            </Animated.View>
            {FLOAT_CARDS.map((c, i) => (
              <FloatCard key={c.title} index={i} live={fit.live} {...c} />
            ))}
            {/* Scène raccourcie : les étoiles tomberaient sur le texte des étiquettes. */}
            {fit.size >= natural ? (
              <>
                <View style={[styles.spark, { top: '30%', left: '22%' }]}>
                  <Sparkle size={20} color="#FB7185" />
                </View>
                <View style={[styles.spark, { top: '34%', right: '20%' }]}>
                  <Sparkle size={18} color="#FB7185" />
                </View>
                <View style={[styles.spark, { bottom: '8%', left: '16%' }]}>
                  <Sparkle size={14} color="#FB7185" opacity={0.8} />
                </View>
              </>
            ) : null}
          </View>
          <Animated.Text
            entering={fit.enter(fadeUp(1100, 18, 500))}
            style={[styles.hookTitle, { fontSize: titleSize, lineHeight: titleSize * 1.15 }]}
            accessibilityRole="header"
          >
            Ta salle de bain{'\n'}vient de trouver sa{'\n'}traductrice.
          </Animated.Text>
          <Animated.View
            entering={fit.enter(fade(1500, 500))}
            style={styles.underlineWrap}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Svg width={titleSize * 6} height={14} viewBox="0 0 200 14" preserveAspectRatio="none">
              <Path d="M4 9 C 60 3, 140 3, 196 8" stroke={colors.rose} strokeWidth={5} strokeLinecap="round" fill="none" />
            </Svg>
          </Animated.View>
          <Animated.Text entering={fit.enter(fadeUp(1700, 12, 480))} style={styles.hookSub}>
            CosmeCheck te dit réellement si un produit est fait pour toi et correspond à ton profil.
          </Animated.Text>
        </View>
      </ScrollView>
      <Footer {...props} active={1} />
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  column: { width: '100%', maxWidth: FLOW_MAX_WIDTH, alignSelf: 'center' },
  scroll: { flexGrow: 1, paddingHorizontal: GUTTER, paddingTop: 24, paddingBottom: 12, justifyContent: 'center' },
  hookTitle: {
    fontFamily: fontFamilies.bold,
    color: colors.ink,
    textAlign: 'center',
    letterSpacing: -0.8,
  },
  arrow: { alignSelf: 'center', marginTop: 14, marginBottom: 4 },
  highlightWrap: { alignItems: 'center', marginTop: 4 },
  highlight: {
    backgroundColor: '#BBF7D0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 2,
    transform: [{ rotate: '-3deg' }],
    shadowColor: '#16A34A',
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  highlightText: {
    fontFamily: fontFamilies.bold,
    color: colors.rating.vert.ink,
    textAlign: 'center',
    letterSpacing: -0.8,
  },
  hidden: { opacity: 0 },
  collage: { width: '100%' },
  proof: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
    gap: 6,
  },
  laurel: { width: 22, height: 50 },
  proofCol: { alignItems: 'center', flexShrink: 1, paddingHorizontal: 6 },
  proofNum: { fontFamily: fontFamilies.bold, fontSize: 24, color: colors.ink, letterSpacing: -0.4 },
  proofLabel: { fontFamily: fontFamilies.regular, fontSize: 13, color: colors.inkMuted, textAlign: 'center' },
  proofSep: { width: 1, alignSelf: 'stretch', backgroundColor: colors.border, marginVertical: 4 },

  footer: { paddingHorizontal: GUTTER, paddingTop: 8, backgroundColor: colors.bg },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 16 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotOn: { width: 24, backgroundColor: colors.rose },
  signin: {
    fontFamily: fontFamilies.regular,
    fontSize: 15,
    color: colors.inkMuted,
    textAlign: 'center',
    marginTop: 14,
    marginBottom: 2,
  },
  signinLink: { color: colors.rose, fontFamily: fontFamilies.semiBold, textDecorationLine: 'underline' },

  stage: { width: '100%', alignSelf: 'center', marginBottom: 14, justifyContent: 'center' },
  perle: { aspectRatio: PERLE_RATIO, alignSelf: 'center' },
  spark: { position: 'absolute' },
  floatHost: { position: 'absolute' },
  perleWrap: { alignItems: 'center', width: '100%' },
  floatCard: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 128,
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  floatDot: { width: 10, height: 10, borderRadius: 5, marginBottom: 6 },
  floatTitle: { fontFamily: fontFamilies.bold, fontSize: 15, color: colors.ink },
  floatSub: { fontFamily: fontFamilies.regular, fontSize: 13, color: colors.inkMuted, marginTop: 1 },
  underlineWrap: { alignItems: 'center', marginTop: -4, marginBottom: 10 },
  hookSub: {
    fontFamily: fontFamilies.regular,
    fontSize: 17,
    lineHeight: 25,
    color: colors.inkMuted,
    textAlign: 'center',
  },
})
