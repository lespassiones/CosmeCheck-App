/**
 * Tons visuels par verdict de cohérence — twin mobile de
 * components/coherence/tone.ts (web). Adossé aux tokens `colors.verdict`
 * (source unique de vérité côté mobile).
 *
 * Chaque ton fournit :
 *   - label : libellé FR du verdict
 *   - solid : couleur pleine (points, remplissage de barre)
 *   - soft  : fond pastel pour les pills
 *   - ring  : couleur de bordure des pills soft
 *   - text  : couleur du texte (sur fond soft)
 */

import { colors } from '@/constants/colors'
import type { CoherenceVerdict } from '@/lib/coherence/types'

export interface VerdictTone {
  label: string
  solid: string
  soft: string
  ring: string
  text: string
}

export const VERDICT_TONE: Record<CoherenceVerdict, VerdictTone> = {
  tenue: {
    label: 'Tenue',
    solid: colors.verdict.tenue.DEFAULT,
    soft: colors.verdict.tenue.soft,
    ring: colors.verdict.tenue.ring,
    text: colors.verdict.tenue.text,
  },
  partielle: {
    label: 'Partielle',
    solid: colors.verdict.partielle.DEFAULT,
    soft: colors.verdict.partielle.soft,
    ring: colors.verdict.partielle.ring,
    text: colors.verdict.partielle.text,
  },
  marketing: {
    label: 'Marketing',
    solid: colors.verdict.marketing.DEFAULT,
    soft: colors.verdict.marketing.soft,
    ring: colors.verdict.marketing.ring,
    text: colors.verdict.marketing.text,
  },
  non_demontree: {
    label: 'Non démontré',
    solid: colors.verdict.non_demontree.DEFAULT,
    soft: colors.verdict.non_demontree.soft,
    ring: colors.verdict.non_demontree.ring,
    text: colors.verdict.non_demontree.text,
  },
  contredite: {
    label: 'Contredite',
    solid: colors.verdict.contredite.DEFAULT,
    soft: colors.verdict.contredite.soft,
    ring: colors.verdict.contredite.ring,
    text: colors.verdict.contredite.text,
  },
}

/** Couleur pastille selon le rating sécurité d'un ingrédient (Vert/Jaune/…). */
export function ratingDotColor(rating: 'Vert' | 'Jaune' | 'Orange' | 'Rouge' | null): string {
  switch (rating) {
    case 'Vert':
      return colors.spectrum.vert
    case 'Jaune':
      return colors.spectrum.jaune
    case 'Orange':
      return colors.spectrum.orange
    case 'Rouge':
      return colors.spectrum.rouge
    default:
      return colors.gray300
  }
}

/** Libellé FR convivial pour la raison d'une mention non vérifiable. */
export const UNVERIFIABLE_REASON_LABEL: Record<string, string> = {
  composition: 'composition',
  certification: 'certification',
  sensoriel: 'sensoriel',
  marketing_general: 'marketing général',
  autre: 'autre',
}
