/**
 * Tokens d'animation (§1.6) — Reanimated 4.
 * Reproduit les keyframes du web. Toutes les animations doivent être
 * désactivées quand reduce-motion est actif (le caller passe le flag,
 * récupéré via AccessibilityInfo.isReduceMotionEnabled() / useReducedMotion()).
 */

import { Easing } from 'react-native-reanimated'

// ── Courbes d'easing ──────────────────────────────────────────────

export const easings = {
  /** reveal / stagger — bezier(0.16, 1, 0.3, 1) (ease-out doux) */
  reveal: Easing.bezier(0.16, 1, 0.3, 1),
  /** blob-pop — bezier(0.34, 1.56, 0.64, 1) (overshoot) */
  blobPop: Easing.bezier(0.34, 1.56, 0.64, 1),
  /** ring / donut — ease-out-cubic */
  ring: Easing.out(Easing.cubic),
} as const

// ── Durées (ms) ───────────────────────────────────────────────────

export const durations = {
  /** reveal (translateY 20→0 + opacity) */
  reveal: 900,
  /** stagger-up (12→0) — durée d'un item */
  stagger: 520,
  /** blob-pop (scale 0.55→1 overshoot + opacity) */
  blobPop: 720,
  /** score/donut ring 0→value (plus rapide que le web sur mobile) */
  ring: 1200,
} as const

// ── Presets prêts à l'emploi pour withTiming ──────────────────────

export const motionConfig = {
  reveal:  { duration: durations.reveal,  easing: easings.reveal },
  stagger: { duration: durations.stagger, easing: easings.reveal },
  blobPop: { duration: durations.blobPop, easing: easings.blobPop },
  ring:    { duration: durations.ring,    easing: easings.ring },
} as const

/** Délai d'apparition échelonnée pour un item d'index donné (ms). */
export function staggerDelay(index: number, step = 70): number {
  return index * step
}

export type MotionPreset = keyof typeof motionConfig

/**
 * Respecte reduce-motion. Le caller passe le flag (booléen) obtenu via
 * useReducedMotion() ou AccessibilityInfo.isReduceMotionEnabled().
 *
 * - Si reduceMotion === true → durée 0 (transition instantanée, état final immédiat).
 * - Sinon → le preset demandé.
 */
export function timingFor(
  preset: MotionPreset,
  reduceMotion: boolean,
): { duration: number; easing: typeof easings[keyof typeof easings] } {
  if (reduceMotion) {
    return { duration: 0, easing: motionConfig[preset].easing }
  }
  return motionConfig[preset]
}

/** Retourne 0 si reduce-motion, sinon le délai stagger calculé. */
export function staggerDelayFor(index: number, reduceMotion: boolean, step = 70): number {
  return reduceMotion ? 0 : staggerDelay(index, step)
}
