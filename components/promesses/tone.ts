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
  /** Libellé court pour les badges de ligne (mockup : « Tenu », « Partiel »…). */
  badge: string
  solid: string
  soft: string
  ring: string
  text: string
}

export const VERDICT_TONE: Record<CoherenceVerdict, VerdictTone> = {
  tenue: {
    label: 'Tenue',
    badge: 'Tenu',
    solid: colors.verdict.tenue.DEFAULT,
    soft: colors.verdict.tenue.soft,
    ring: colors.verdict.tenue.ring,
    text: colors.verdict.tenue.text,
  },
  partielle: {
    label: 'Partielle',
    badge: 'Partiel',
    solid: colors.verdict.partielle.DEFAULT,
    soft: colors.verdict.partielle.soft,
    ring: colors.verdict.partielle.ring,
    text: colors.verdict.partielle.text,
  },
  marketing: {
    label: 'Marketing',
    badge: 'Marketing',
    solid: colors.verdict.marketing.DEFAULT,
    soft: colors.verdict.marketing.soft,
    ring: colors.verdict.marketing.ring,
    text: colors.verdict.marketing.text,
  },
  non_demontree: {
    label: 'Non démontré',
    badge: 'Non démontré',
    solid: colors.verdict.non_demontree.DEFAULT,
    soft: colors.verdict.non_demontree.soft,
    ring: colors.verdict.non_demontree.ring,
    text: colors.verdict.non_demontree.text,
  },
  contredite: {
    label: 'Contredite',
    badge: 'Contredite',
    solid: colors.verdict.contredite.DEFAULT,
    soft: colors.verdict.contredite.soft,
    ring: colors.verdict.contredite.ring,
    text: colors.verdict.contredite.text,
  },
}

/** Pluriel FR du libellé de verdict pour les pastilles de synthèse du hero. */
export function verdictChipLabel(verdict: CoherenceVerdict, count: number): string {
  switch (verdict) {
    case 'tenue':
      return `${count} tenue${count > 1 ? 's' : ''}`
    case 'partielle':
      return `${count} partielle${count > 1 ? 's' : ''}`
    case 'marketing':
      return `${count} marketing`
    case 'non_demontree':
      return `${count} non démontrée${count > 1 ? 's' : ''}`
    case 'contredite':
      return `${count} contredite${count > 1 ? 's' : ''}`
  }
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

/**
 * Couleur de l'anneau de synthèse « promesses tenues » selon le %.
 * SOURCE UNIQUE partagée entre le hero (VerdictGlobalCard) et la liste onglet
 * (/promesses) → la couleur est IDENTIQUE liste ↔ détail pour un même produit.
 * Seuils : ≥80 vert · ≥60 jaune · ≥35 orange · <35 rouge.
 */
export function promiseRingColor(pct: number): string {
  if (pct >= 80) return '#16A34A' // vert
  if (pct >= 60) return '#FBBF24' // jaune
  if (pct >= 35) return '#F97316' // orange
  return '#F43F5E' // rouge
}

/** Libellé FR convivial pour la raison d'une mention non vérifiable. */
export const UNVERIFIABLE_REASON_LABEL: Record<string, string> = {
  composition: 'composition',
  certification: 'certification',
  sensoriel: 'sensoriel',
  marketing_general: 'marketing général',
  autre: 'autre',
}
