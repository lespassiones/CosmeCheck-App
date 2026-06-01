/**
 * Espacement (grille 4px) et rayons de bordure du design system CosmeCheck.
 * Référencés par docs/DESIGN_SYSTEM.md.
 */

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
  '4xl': 64,
} as const

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  card: 24,
  pill: 28,
  full: 9999,
} as const

export type SpacingKey = keyof typeof spacing
export type RadiusKey = keyof typeof radius
