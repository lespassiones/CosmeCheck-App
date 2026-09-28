/**
 * AdvisorReveal : le Beauty Advisor s'ouvre en cercle qui grandit depuis Perle.
 *
 * Au tap sur le bouton flottant, trois disques sortent de sous la mascotte
 * (rose, rose pâle, puis le fond de la page) et grandissent en vagues en
 * remontant vers le centre, jusqu'à couvrir l'écran. La page Advisor arrive
 * alors en fondu sur un fond identique : aucun raccord. Au retour (bouton,
 * geste, touche retour Android), les disques se rétractent dans Perle.
 *
 * Monté par `app/(tabs)/_layout.tsx`, au-dessus des onglets et SOUS le bouton :
 * Perle reste visible pendant que les vagues partent de derrière elle, puis
 * s'efface quand la page arrive. Les disques restent déployés sous la page
 * Advisor tant qu'elle est ouverte, c'est ce qui permet le retour en cercle.
 *
 * Aucun ressort ni rebond : une progression linéaire, une courbe douce par
 * disque. « Réduire les animations » : navigation directe, sans cercle.
 * Géométrie pure et testée : `lib/navigation/advisorReveal.ts`.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type FC } from 'react'
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import { useFocusEffect, useNavigation } from 'expo-router'
import type { ParamListBase } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'

import { colors } from '@/constants/colors'
import {
  discAt,
  fabOpacity,
  REVEAL_CLOSE_MS,
  REVEAL_NAVIGATE_AT,
  REVEAL_OPEN_MS,
  REVEAL_WAVES,
  revealGeometry,
  waveProgress,
  type RevealGeometry,
  type RevealWave,
} from '@/lib/navigation/advisorReveal'

/** Couleur de chaque vague, de dessous à dessus. La dernière = fond de la page Advisor. */
const WAVE_COLORS = [colors.rose, colors.roseSoft, colors.bg]
const EASE = Easing.inOut(Easing.cubic)
/** Filet de sécurité si la fin de transition n'arrive pas au retour sur les onglets. */
const RETURN_FALLBACK_MS = 900

type Phase = 'idle' | 'opening' | 'open' | 'closing'

interface RevealOptions {
  /** Pousse la page Advisor (appelé pendant les vagues, ou tout de suite sans animation). */
  onNavigate: () => void
  /** Placement du bouton Perle dans l'écran des onglets (dp). */
  fabRight: number
  fabBottom: number
  fabSize: number
}

/**
 * `open` : à brancher sur le bouton Perle. `onLayout` : sur la vue racine des
 * onglets (mesure de l'écran). `fabStyle` : sur le conteneur du bouton, qui
 * s'efface quand la page arrive.
 */
export type AdvisorRevealState = ReturnType<typeof useAdvisorReveal>

export function useAdvisorReveal({ onNavigate, fabRight, fabBottom, fabSize }: RevealOptions) {
  // Navigation de la route (tabs) dans la pile racine : ses fins de transition
  // disent quand la page Advisor a fini de partir.
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>()
  const reduceMotion = useReducedMotion()
  const progress = useSharedValue(0)
  const [phase, setPhase] = useState<Phase>('idle')
  const phaseRef = useRef<Phase>('idle')
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>())
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)

  useEffect(() => {
    const pending = timers.current
    return () => {
      pending.forEach(clearTimeout)
      pending.clear()
    }
  }, [])

  const go = useCallback((next: Phase) => {
    phaseRef.current = next
    setPhase(next)
  }, [])

  const after = useCallback((ms: number, fn: () => void) => {
    const id = setTimeout(() => {
      timers.current.delete(id)
      fn()
    }, ms)
    timers.current.add(id)
  }, [])

  const close = useCallback(() => {
    if (phaseRef.current !== 'open' && phaseRef.current !== 'opening') return
    go('closing')
    progress.value = withTiming(0, { duration: REVEAL_CLOSE_MS, easing: Easing.linear })
    after(REVEAL_CLOSE_MS + 40, () => {
      if (phaseRef.current === 'closing') go('idle')
    })
  }, [after, go, progress])

  const geometry = useMemo(() => {
    if (!size) return null
    const r = fabSize / 2
    return revealGeometry(
      size.width,
      size.height,
      size.width - fabRight - r,
      size.height - fabBottom - r,
      r,
    )
  }, [size, fabRight, fabBottom, fabSize])

  const open = useCallback(() => {
    if (phaseRef.current !== 'idle') return
    // Réduire les animations, ou écran pas encore mesuré : navigation directe.
    if (reduceMotion || !geometry) {
      onNavigate()
      return
    }
    go('opening')
    progress.value = 0
    progress.value = withTiming(1, { duration: REVEAL_OPEN_MS, easing: Easing.linear })
    after(REVEAL_OPEN_MS * REVEAL_NAVIGATE_AT, onNavigate)
    after(REVEAL_OPEN_MS, () => {
      if (phaseRef.current !== 'opening') return
      go('open')
      // La page n'est pas arrivée (navigation refusée) : on ne laisse pas l'écran couvert.
      if (navigation.isFocused()) close()
    })
  }, [after, close, geometry, go, navigation, onNavigate, progress, reduceMotion])

  // Retour sur les onglets, une fois le fondu ou le geste de retour terminé.
  useEffect(
    () =>
      navigation.addListener('transitionEnd', (e) => {
        if (!e.data.closing) close()
      }),
    [navigation, close],
  )

  useFocusEffect(
    useCallback(() => {
      if (phaseRef.current !== 'open' && phaseRef.current !== 'opening') return
      const id = setTimeout(close, RETURN_FALLBACK_MS)
      return () => clearTimeout(id)
    }, [close]),
  )

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout
    setSize((s) => (s && s.width === width && s.height === height ? s : { width, height }))
  }, [])

  const fabStyle = useAnimatedStyle(() => ({ opacity: fabOpacity(progress.value) }))

  return { open, onLayout, fabStyle, phase, geometry, progress }
}

export const AdvisorRevealOverlay: FC<{ reveal: AdvisorRevealState }> = ({ reveal }) => {
  const { phase, geometry, progress } = reveal
  if (phase === 'idle' || !geometry) return null
  return (
    <View
      style={styles.overlay}
      // Pendant l'ouverture, aucun tap ne passe (pas d'onglet ni de double ouverture).
      pointerEvents={phase === 'opening' ? 'auto' : 'none'}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {REVEAL_WAVES.map((wave, i) => (
        <RevealDisc
          key={i}
          wave={wave}
          color={WAVE_COLORS[i]}
          geometry={geometry}
          progress={progress}
        />
      ))}
    </View>
  )
}

interface DiscProps {
  wave: RevealWave
  color: string
  geometry: RevealGeometry
  progress: SharedValue<number>
}

/**
 * Un disque de la taille finale, réduit et déplacé par transformation : aucun
 * recalcul de mise en page par image, et un bord lissé sur les deux plateformes.
 */
const RevealDisc: FC<DiscProps> = ({ wave, color, geometry, progress }) => {
  const R = geometry.toR
  const animStyle = useAnimatedStyle(() => {
    const { cx, cy, r } = discAt(EASE(waveProgress(progress.value, wave)), geometry)
    return {
      transform: [{ translateX: cx - R }, { translateY: cy - R }, { scale: r / R }],
    }
  })
  return (
    <Animated.View
      style={[
        styles.disc,
        { width: R * 2, height: R * 2, borderRadius: R, backgroundColor: color },
        animStyle,
      ]}
    />
  )
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    // Sous le bouton Perle (zIndex 75), au-dessus des onglets et de leur barre.
    zIndex: 74,
    overflow: 'hidden',
  },
  disc: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
})
