/**
 * Tokens d'ombres pour React Native.
 * iOS: shadowColor, shadowOffset, shadowOpacity, shadowRadius
 * Android: elevation (approximation)
 */

import { Platform } from 'react-native'
import { colors } from './colors'

// ── Ombres standard ───────────────────────────────────────────────

export const shadows = {
  /** Ombre très légère — pour les inputs et petits éléments */
  xs: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 4,
    },
    android: { elevation: 1 },
    default: {},
  }),

  /** Ombre légère — pour les cartes */
  light: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 8,
    },
    android: { elevation: 3 },
    default: {},
  }),

  /** Ombre moyenne — pour les modals et sheets */
  medium: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.10,
      shadowRadius: 16,
    },
    android: { elevation: 6 },
    default: {},
  }),

  /** Ombre forte — pour les éléments flottants (FAB, toast) */
  heavy: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.16,
      shadowRadius: 24,
    },
    android: { elevation: 12 },
    default: {},
  }),

  /** Ombre pour le FAB rose (colorée avec la couleur rose) */
  fab: Platform.select({
    ios: {
      shadowColor: '#F43F5E',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.35,
      shadowRadius: 12,
    },
    android: { elevation: 10 },
    default: {},
  }),
}

// ── Ombres neumorphiques ──────────────────────────────────────────

/**
 * Note sur les ombres neumorphiques:
 * React Native ne supporte qu'une ombre par View.
 * Pour l'effet double face, utiliser 2 Views superposées.
 *
 * View 1 (ombre sombre — bas-droit pour "raised"):
 *   shadowColor: colors.neu.shadowDark
 *   shadowOffset: { width: 6, height: 6 }
 *   shadowOpacity: 1
 *   shadowRadius: 10
 *
 * View 2 (ombre claire — haut-gauche pour "raised"):
 *   shadowColor: colors.neu.shadowLight
 *   shadowOffset: { width: -4, height: -4 }
 *   shadowOpacity: 0.8
 *   shadowRadius: 8
 */

// ── Recettes d'ombres nommées par surface (§1.3) ──────────────────
//
// RN ne rend qu'UNE ombre par View sur iOS + elevation sur Android.
// Chaque recette retourne {shadowColor, shadowOpacity, shadowRadius, shadowOffset, elevation}.
// On garde toutes les clés sur toutes les plateformes (elevation ignorée sur iOS,
// les props shadow* ignorées sur Android) → un seul style applicable directement.

export type SurfaceShadow = {
  shadowColor: string
  shadowOpacity: number
  shadowRadius: number
  shadowOffset: { width: number; height: number }
  elevation: number
}

export const surfaceShadows = {
  /** Carte standard — ombre très légère */
  card: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.05,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  /** GlassCard — n'utilise que la plus grande ombre web (le liseré clair top se fait via borderTopColor) */
  glassCard: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.18,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 16 },
    elevation: 8,
  },
  /** GlassPill */
  glassPill: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.16,
    shadowRadius: 11,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  /** CTA verre foncé */
  darkGlass: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.45,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 22 },
    elevation: 12,
  },
  /** Champ de recherche focus (halo rose) */
  searchFocus: {
    shadowColor: '#F43F5E',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  /** FAB Décode (halo rose intense) */
  fab: {
    shadowColor: '#F43F5E',
    shadowOpacity: 0.55,
    shadowRadius: 11,
    shadowOffset: { width: 0, height: 8 },
    elevation: 14,
  },
  /** Pilule de navigation flottante (halo rose doux) */
  bottomNavPill: {
    shadowColor: '#F43F5E',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
} as const satisfies Record<string, SurfaceShadow>

export type SurfaceShadowKey = keyof typeof surfaceShadows

/**
 * Retourne l'objet de style d'ombre pour une surface nommée.
 * Applicable directement dans un style RN ; les props non pertinentes
 * sont ignorées par la plateforme courante (elevation sur iOS, shadow* sur Android).
 */
export function getShadow(key: SurfaceShadowKey): SurfaceShadow {
  return surfaceShadows[key]
}

export const neuShadows = {
  /** Ombre sombre côté bas-droit (neu raised) */
  raisedDark: Platform.select({
    ios: {
      shadowColor: colors.neu.shadowDark,
      shadowOffset: { width: 6, height: 6 },
      shadowOpacity: 1,
      shadowRadius: 10,
    },
    android: { elevation: 8 },
    default: {},
  }),

  /** Ombre claire côté haut-gauche (neu raised — View superposée) */
  raisedLight: Platform.select({
    ios: {
      shadowColor: colors.neu.shadowLight,
      shadowOffset: { width: -4, height: -4 },
      shadowOpacity: 0.8,
      shadowRadius: 8,
    },
    default: {},
  }),

  /** Ombre sombre côté haut-gauche (neu pressed — inversion) */
  pressedDark: Platform.select({
    ios: {
      shadowColor: colors.neu.shadowDark,
      shadowOffset: { width: -3, height: -3 },
      shadowOpacity: 0.7,
      shadowRadius: 6,
    },
    android: { elevation: 0 },
    default: {},
  }),

  /** Ombre claire côté bas-droit (neu pressed — inversion) */
  pressedLight: Platform.select({
    ios: {
      shadowColor: colors.neu.shadowLight,
      shadowOffset: { width: 3, height: 3 },
      shadowOpacity: 0.9,
      shadowRadius: 6,
    },
    default: {},
  }),
}
