/**
 * Barème étoiles « Qualité de la formule » — SOURCE UNIQUE partagée entre
 * l'écran d'analyse (app/analyse/[id].tsx) et la carte d'aperçu scan
 * (components/scan/ScanPreviewCard.tsx). Le NOMBRE d'étoiles pleines ET leur
 * COULEUR encodent la note (la pastille reste la source de vérité) :
 *   5 vertes = très douce · 4 vertes = saine · 3 jaunes = à surveiller
 *   2 oranges = moyenne · 1 rouge = à examiner. Lecture gauche→droite.
 * Le vert n'est plus l'émeraude du web : c'est celui des boutons de l'app.
 *
 * Imports type-only volontaires : aucun couplage runtime (react-native-svg),
 * ce module reste importable partout (tests inclus).
 */
import type { VerdictTone } from '@/lib/essentiel/engine'
import type { StarPalette } from '@/components/analysis/Star3D'

export const STARS_BY_TONE: Record<VerdictTone, number> = {
  'very-safe': 5,
  safe: 4,
  caution: 3,
  warning: 2,
  danger: 1,
  'high-risk': 1,
  unknown: 0,
}

// Vert = EXACTEMENT celui des boutons (colors.success #16A34A, demande user
// 28/09/2026), sur 5 comme sur 4 étoiles : le nombre suffit à les distinguer.
const STAR_GREEN: StarPalette = { face: '#16A34A', dark: '#166534', light: '#22C55E' } // green 600/800/500

export const STAR_PALETTE_BY_TONE: Record<VerdictTone, StarPalette> = {
  'very-safe': STAR_GREEN,
  safe: STAR_GREEN,
  caution: { face: '#FBBF24', dark: '#D97706', light: '#FDE68A' }, // amber 400/600/200
  warning: { face: '#F97316', dark: '#C2410C', light: '#FDBA74' }, // orange 500/700/300
  danger: { face: '#F43F5E', dark: '#BE123C', light: '#FDA4AF' }, // rose 500/700/300
  'high-risk': { face: '#F43F5E', dark: '#BE123C', light: '#FDA4AF' },
  unknown: { face: '#E5E7EB', dark: '#C7CBD1', light: '#F5F6F8' },
}

export const STAR_EMPTY_PALETTE: StarPalette = {
  face: '#E5E7EB',
  dark: '#C7CBD1',
  light: '#F5F6F8',
} // gray
