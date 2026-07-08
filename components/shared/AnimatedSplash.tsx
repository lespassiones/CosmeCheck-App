/**
 * AnimatedSplash — écran de lancement animé de Cosme Check.
 *
 * Overlay plein écran OPAQUE monté au-dessus de toute l'app (dans les providers,
 * a besoin du QueryClient via useProfile). Séquence :
 *   1. Les 3 points de la marque (rose, vert, violet) tombent en rebondissant
 *      (spring, staggered), puis « respirent » doucement en boucle tant qu'on
 *      attend l'auth.
 *   2. Le wordmark « Cosme Check » s'écrit lettre par lettre (effet machine à
 *      écrire) avec un curseur clignotant.
 *   3. Quand l'animation minimale est jouée ET que l'auth est résolue (ou après
 *      un délai plafond de sécurité), l'overlay se fond et appelle onFinish.
 *
 * C'est cet overlay qui pilote le masquage du splash NATIF : il le cache dès son
 * montage (polices prêtes) pour que l'animation démarre immédiatement, et reste
 * opaque le temps que l'AuthGuard décide de la route → aucun flash intermédiaire.
 */

import { useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import * as SplashScreen from 'expo-splash-screen'

import { colors } from '@/constants/colors'
import { fontFamilies } from '@/constants/typography'
import { useAuth } from '@/hooks/useAuth'
import { useProfile } from '@/hooks/useProfile'

// ── Paramètres de l'animation ──────────────────────────────────────────
const DOT_COLORS = ['#F6099B', '#54D41D', '#5F1EE1'] as const // rose, vert, violet (cf. LogoMark)
const WORD = 'Cosme Check'
const DOT_SIZE = 26
const DOT_GAP = 15
const DOT_DROP = -80 // px au-dessus de la position finale (point de départ de la chute)
const DOT_STAGGER = 130 // décalage entre chaque point (ms)
const TYPE_START = 720 // début de la frappe (ms), après l'atterrissage des points
const LETTER_MS = 85 // délai entre deux lettres (ms)
const HOLD_AFTER = 520 // pause après la dernière lettre avant fondu possible (ms)
const FADE_MS = 380 // durée du fondu de sortie (ms)
const MAX_WAIT = 6000 // filet de sécurité : ne jamais bloquer l'app au-delà (ms)

const WORD_FONT_SIZE = 30

/**
 * Un point de la marque : chute + rebond (spring) à l'entrée, puis respiration
 * douce en boucle (scale) pendant l'attente de l'auth.
 */
function Dot({ color, index }: { color: string; index: number }) {
  const translateY = useSharedValue(DOT_DROP)
  const opacity = useSharedValue(0)
  const scale = useSharedValue(0.5)

  useEffect(() => {
    const delay = index * DOT_STAGGER
    opacity.value = withDelay(delay, withTiming(1, { duration: 140 }))
    // Chute avec rebond (damping bas = overshoot visible).
    translateY.value = withDelay(delay, withSpring(0, { damping: 6, stiffness: 190, mass: 0.7 }))
    scale.value = withDelay(
      delay,
      withSequence(
        withSpring(1, { damping: 5, stiffness: 210, mass: 0.6 }),
        // Respiration continue une fois posé (évite l'effet figé pendant l'attente).
        withDelay(
          450,
          withRepeat(
            withSequence(
              withTiming(1.12, { duration: 720, easing: Easing.inOut(Easing.ease) }),
              withTiming(1, { duration: 720, easing: Easing.inOut(Easing.ease) }),
            ),
            -1,
            false,
          ),
        ),
      ),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
  }))

  return (
    <Animated.View
      style={[
        styles.dot,
        { backgroundColor: color, marginLeft: index === 0 ? 0 : DOT_GAP },
        style,
      ]}
    />
  )
}

export function AnimatedSplash({ onFinish }: { onFinish: () => void }) {
  const { isLoading: authLoading, isAuthenticated } = useAuth()
  const { isLoading: profileLoading } = useProfile()

  // Auth résolue : plus de chargement auth et (invité, ou profil chargé).
  const ready = !authLoading && (!isAuthenticated || !profileLoading)

  const [typed, setTyped] = useState(0)
  const [animDone, setAnimDone] = useState(false)
  const [forceReady, setForceReady] = useState(false)
  const [wordWidth, setWordWidth] = useState<number | null>(null)

  const containerOpacity = useSharedValue(1)
  const cursorOpacity = useSharedValue(0)
  const finished = useRef(false)

  // Masque le splash NATIF dès le montage (polices prêtes) → l'animation démarre.
  useEffect(() => {
    void SplashScreen.hideAsync().catch(() => {})
  }, [])

  // Machine à écrire + jalon "animation minimale terminée".
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    for (let i = 1; i <= WORD.length; i++) {
      timers.push(setTimeout(() => setTyped(i), TYPE_START + i * LETTER_MS))
    }
    const doneAt = TYPE_START + WORD.length * LETTER_MS + HOLD_AFTER
    timers.push(setTimeout(() => setAnimDone(true), doneAt))
    // Filet de sécurité : ne jamais laisser l'overlay bloquer l'app.
    timers.push(setTimeout(() => setForceReady(true), MAX_WAIT))
    return () => timers.forEach(clearTimeout)
  }, [])

  // Curseur clignotant pendant la frappe.
  useEffect(() => {
    cursorOpacity.value = withDelay(
      TYPE_START,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 60 }),
          withTiming(1, { duration: 360 }),
          withTiming(0, { duration: 360 }),
        ),
        -1,
        false,
      ),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Fondu de sortie une fois l'animation jouée ET l'auth prête (ou plafond atteint).
  useEffect(() => {
    if (animDone && (ready || forceReady) && !finished.current) {
      finished.current = true
      containerOpacity.value = withTiming(
        0,
        { duration: FADE_MS, easing: Easing.out(Easing.quad) },
        (done) => {
          if (done) runOnJS(onFinish)()
        },
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animDone, ready, forceReady])

  const containerStyle = useAnimatedStyle(() => ({ opacity: containerOpacity.value }))
  const cursorStyle = useAnimatedStyle(() => ({ opacity: cursorOpacity.value }))

  const typingDone = typed >= WORD.length

  return (
    <Animated.View style={[styles.container, containerStyle]} pointerEvents="none">
      <View style={styles.dotsRow}>
        {DOT_COLORS.map((c, i) => (
          <Dot key={c} color={c} index={i} />
        ))}
      </View>

      <View style={styles.wordRow}>
        {/* Mesure invisible du wordmark complet → largeur fixe (bloc centré,
            frappe qui grandit de gauche à droite sans décaler le centre). */}
        <Text
          style={[styles.word, styles.wordMeasure]}
          allowFontScaling={false}
          numberOfLines={1}
          onLayout={(e) => setWordWidth(e.nativeEvent.layout.width)}
        >
          {WORD}
        </Text>

        <View style={[styles.wordInner, wordWidth != null ? { width: wordWidth } : null]}>
          <Text style={styles.word} allowFontScaling={false} numberOfLines={1}>
            {WORD.slice(0, typed)}
          </Text>
          {!typingDone ? <Animated.View style={[styles.cursor, cursorStyle]} /> : null}
        </View>
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    // Pas d'`elevation` : sur Android, une elevation (ombre) sur une vue plein
    // écran translucide (pendant le fondu) force un rendu SOFTWARE de la zone,
    // ce qui fait crasher le dessin des hardware bitmaps (expo-image) situés
    // dessous. zIndex suffit à passer au-dessus dans le même parent.
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 34,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
  },
  wordRow: {
    height: WORD_FONT_SIZE * 1.4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  word: {
    fontFamily: fontFamilies.bold,
    fontSize: WORD_FONT_SIZE,
    letterSpacing: -0.5,
    color: colors.ink,
  },
  wordMeasure: {
    position: 'absolute',
    opacity: 0,
  },
  cursor: {
    width: 2.5,
    height: WORD_FONT_SIZE * 0.9,
    borderRadius: 2,
    backgroundColor: colors.rose,
    marginLeft: 3,
  },
})
