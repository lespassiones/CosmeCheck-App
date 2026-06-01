/**
 * Tokens de dégradés pour React Native (expo-linear-gradient).
 * Les dégradés CSS du web sont convertis en colors[] + start/end (+ locations).
 *
 * Table de conversion des angles CSS → start/end:
 *   135deg / 145deg → start {x:0,y:0}  end {x:1,y:1}
 *   to-r            → start {x:0,y:0.5} end {x:1,y:0.5}
 *   to-b            → start {x:0,y:0}   end {x:0,y:1}
 *   to-br           → start {x:0,y:0}   end {x:1,y:1}
 *   to-bl           → start {x:1,y:0}   end {x:0,y:1}
 *   to-tr           → start {x:0,y:1}   end {x:1,y:0}
 *
 * gradient-text et le mot "Check" du Logo nécessitent MaskedView + LinearGradient.
 * FAB / cartes utilisent expo-linear-gradient directement.
 */

export const gradients = {
  neuBtnPrimary:  { colors: ['#9b6ef5', '#7c3aed'], start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
  roseCta:        { colors: ['#F43F5E', '#EC4899'], start: { x: 0, y: 0 }, end: { x: 1, y: 0.5 } }, // rose-500→pink-500
  roseCtaSoft:    { colors: ['#FB7185', '#F472B6'], start: { x: 0, y: 0 }, end: { x: 1, y: 0.5 } }, // variante 400
  fab:            { colors: ['#FB7185', '#EC4899'], start: { x: 0, y: 0 }, end: { x: 1, y: 1 } }, // rose-400→pink-500
  darkGlass:      { colors: ['#1F2937', '#111111', '#0A0A0A'], start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
  gradientText:   { colors: ['#8b5cf6', '#ec4899', '#f97316'], start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
  advisorCard:    { colors: ['#6C3FD8', '#4F46E5', '#7C3AED'], locations: [0, 0.55, 1], start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
  promessesCard:  { colors: ['#D6F5D6', '#E8FAE8', '#C8F0C8'], locations: [0, 0.5, 1], start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
  bottomNavPill:  { colors: ['rgba(255,228,230,0.85)', 'rgba(255,209,220,0.75)'], start: { x: 0, y: 0 }, end: { x: 0, y: 1 } }, // #FFE4E6/85→#FFD1DC/75
  ratingVert:     { colors: ['#10B981', '#22C55E', '#14B8A6'], start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
  ratingJaune:    { colors: ['#FBBF24', '#EAB308', '#FB923C'], start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
  ratingOrange:   { colors: ['#F97316', '#EA580C', '#EF4444'], start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
  ratingRouge:    { colors: ['#EF4444', '#E11D48', '#DB2777'], start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
  verdictDonutTrack: { colors: ['#FB7185', '#E11D48'], start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
  verdictDonutFill:  { colors: ['#34D399', '#059669'], start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
} as const

export type GradientKey = keyof typeof gradients
