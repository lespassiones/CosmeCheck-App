/**
 * Mouvements de l'onboarding : doux, jamais de rebond.
 *
 * Règle produit (28/09/2026) : aucun ressort, aucun dépassement d'échelle,
 * aucun « pop » qui rebondit. Tout entre par un fondu, un léger glissement ou
 * un léger agrandissement, sur une courbe qui ralentit sans jamais dépasser sa
 * cible. Tout respecte le réglage système « réduire les animations ».
 */

import {
  Easing,
  FadeIn,
  FadeInDown,
  FadeInLeft,
  FadeInRight,
  ReduceMotion,
  withDelay,
  withTiming,
  type EntryAnimationsValues,
  type LayoutAnimation,
} from 'react-native-reanimated'

export const RM = ReduceMotion.System
export const EASE_OUT = Easing.out(Easing.cubic)

/** Fondu et glissement vers le haut. */
export function fadeUp(delay = 0, distance = 14, duration = 420) {
  return FadeInDown.delay(delay)
    .duration(duration)
    .easing(EASE_OUT)
    .withInitialValues({ opacity: 0, transform: [{ translateY: distance }] })
    .reduceMotion(RM)
}

/** Fondu et glissement latéral (`from` : côté d'où l'élément arrive). */
export function fadeSide(from: 'left' | 'right', delay = 0, duration = 420) {
  const b = from === 'right' ? FadeInRight : FadeInLeft
  return b.delay(delay).duration(duration).easing(EASE_OUT).reduceMotion(RM)
}

/** Simple fondu. */
export function fade(delay = 0, duration = 400) {
  return FadeIn.delay(delay).duration(duration).reduceMotion(RM)
}

/**
 * Léger agrandissement (de 94 % à 100 %) avec fondu : l'élément se pose, sans
 * rebond ni dépassement.
 */
export function softScaleIn(delay = 0, from = 0.94, duration = 360) {
  return (_values: EntryAnimationsValues): LayoutAnimation => {
    'worklet'
    const cfg = { duration, easing: EASE_OUT, reduceMotion: RM }
    return {
      initialValues: { opacity: 0, transform: [{ scale: from }] },
      animations: {
        opacity: withDelay(delay, withTiming(1, cfg)),
        transform: [{ scale: withDelay(delay, withTiming(1, cfg)) }],
      },
    }
  }
}
