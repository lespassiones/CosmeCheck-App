/**
 * Primitives de micro-interactions (juil 2026) — Reanimated 4.
 *
 * Complète Reveal (apparition d'un bloc) avec :
 *   - listEntering / StaggerItem : entrée échelonnée des items de liste
 *     (FlatList ou map), délai plafonné pour que le scroll reste réactif ;
 *   - PressableScale : feedback d'appui (scale ressort) pour cartes et CTA ;
 *   - AnimatedGaugeFill : remplissage animé d'une jauge horizontale,
 *     re-déclenchable via `animateKey` (même valeur → même largeur, mais
 *     l'utilisateur voit le « recalcul ») ;
 *   - useCountUp : compteur numérique animé (score, pourcentage), même
 *     logique de re-déclenchement.
 *
 * Reduce-motion : les builders utilisent ReduceMotion.System → animations
 * neutralisées automatiquement si le réglage OS est actif.
 */

import { useEffect, useState, type FC, type ReactNode } from 'react'
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native'
import Animated, {
  Easing,
  FadeInDown,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

// ── Entrée échelonnée des items de liste ──────────────────────────────────

/**
 * Animation d'entrée pour l'item d'index donné : fade + translateY, délai
 * échelonné. Au-delà de `maxStaggered` items (ceux montés plus tard, en
 * scrollant), plus de délai — l'item apparaît immédiatement en fondu.
 */
export function listEntering(index: number, step = 55, maxStaggered = 12) {
  const delay = index < maxStaggered ? index * step : 0
  return FadeInDown.delay(delay)
    .duration(380)
    .easing(Easing.out(Easing.cubic))
    .reduceMotion(ReduceMotion.System)
    .withInitialValues({ transform: [{ translateY: 14 }], opacity: 0 })
}

interface StaggerItemProps {
  index: number
  children: ReactNode
  step?: number
  style?: StyleProp<ViewStyle>
}

/** Wrapper d'item de liste : entrée échelonnée selon l'index. */
export const StaggerItem: FC<StaggerItemProps> = ({ index, children, step = 55, style }) => (
  <Animated.View entering={listEntering(index, step)} style={style}>
    {children}
  </Animated.View>
)

// ── Feedback d'appui (scale ressort) ──────────────────────────────────────

const PRESS_SPRING = { damping: 22, stiffness: 380, reduceMotion: ReduceMotion.System }

interface PressableScaleProps extends Omit<PressableProps, 'style' | 'children'> {
  children: ReactNode
  style?: StyleProp<ViewStyle>
  /** Échelle à l'appui (défaut 0.97). */
  scaleTo?: number
}

/**
 * Pressable avec feedback d'échelle animé (ressort). Remplace le pattern
 * `pressed && { transform: [{ scale }] }` par une transition douce.
 */
export const PressableScale: FC<PressableScaleProps> = ({
  children,
  style,
  scaleTo = 0.97,
  onPressIn,
  onPressOut,
  ...rest
}) => {
  const scale = useSharedValue(1)
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))

  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(e) => {
        scale.value = withSpring(scaleTo, PRESS_SPRING)
        onPressIn?.(e)
      }}
      onPressOut={(e) => {
        scale.value = withSpring(1, PRESS_SPRING)
        onPressOut?.(e)
      }}
      style={[style, animatedStyle]}
    >
      {children}
    </AnimatedPressable>
  )
}

// ── Jauge animée re-déclenchable ──────────────────────────────────────────

interface AnimatedGaugeFillProps {
  /** Pourcentage cible (0–100). */
  percent: number
  color: string
  /** Changer cette valeur relance l'animation depuis 0 (même percent). */
  animateKey?: string | number
  delay?: number
  duration?: number
  /** Largeur minimale visible (défaut 2 %). */
  minPercent?: number
}

/**
 * Remplissage animé d'une jauge : à monter DANS une piste (`overflow: hidden`).
 * S'anime au montage et à chaque changement de `animateKey` ou de `percent`.
 */
export const AnimatedGaugeFill: FC<AnimatedGaugeFillProps> = ({
  percent,
  color,
  animateKey = 0,
  delay = 0,
  duration = 700,
  minPercent = 2,
}) => {
  const progress = useSharedValue(0)
  const target = Math.max(minPercent, Math.min(100, percent))

  useEffect(() => {
    progress.value = 0
    progress.value = withDelay(
      delay,
      withTiming(1, {
        duration,
        easing: Easing.out(Easing.cubic),
        reduceMotion: ReduceMotion.System,
      }),
    )
  }, [animateKey, target, delay, duration, progress])

  const fillStyle = useAnimatedStyle(() => ({ width: `${target * progress.value}%` }))

  return (
    <Animated.View
      style={[{ height: '100%', borderRadius: 999, backgroundColor: color }, fillStyle]}
    />
  )
}

// ── Compteur numérique animé ──────────────────────────────────────────────

/**
 * Valeur qui « compte » de 0 vers `target` (ease-out). Relance à chaque
 * changement de `animateKey` — même si `target` est identique, pour donner
 * le sentiment d'un recalcul.
 */
export function useCountUp(
  target: number,
  animateKey: string | number = 0,
  duration = 700,
  delay = 0,
  decimals = 0,
): number {
  const [value, setValue] = useState(0)

  useEffect(() => {
    const factor = Math.pow(10, decimals)
    let raf = 0
    let start: number | null = null
    const timer = setTimeout(() => {
      const tick = (now: number) => {
        if (start === null) start = now
        const t = Math.min(1, (now - start) / duration)
        const eased = 1 - Math.pow(1 - t, 3)
        setValue(Math.round(target * eased * factor) / factor)
        if (t < 1) raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    }, delay)
    return () => {
      clearTimeout(timer)
      cancelAnimationFrame(raf)
    }
  }, [target, animateKey, duration, delay, decimals])

  return value
}
