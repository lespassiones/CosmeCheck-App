/**
 * Ouverture du Beauty Advisor en cercle qui grandit depuis Perle : géométrie
 * PURE (testable sans React), utilisée par `components/navigation/AdvisorReveal`.
 *
 * Trois disques partent de sous le bouton flottant et grandissent en vagues
 * décalées, en remontant vers le centre de l'écran, jusqu'à le couvrir (comme
 * des cercles emboîtés qui s'agrandissent depuis la mascotte). Le dernier a la
 * couleur du fond de la page Advisor, qui arrive alors en fondu sans raccord.
 * Refermer rejoue la même progression à l'envers, vers Perle.
 *
 * Les fonctions marquées 'worklet' tournent aussi sur le thread UI (Reanimated).
 */

/** Durée de l'ouverture (ms), progression linéaire, courbe appliquée par disque. */
export const REVEAL_OPEN_MS = 560
/** Durée du retour vers Perle (ms). */
export const REVEAL_CLOSE_MS = 460
/**
 * Moment où l'on pousse la page (part de l'ouverture) : le dernier disque
 * couvre déjà presque tout l'écran, et le montage de la page se fait pendant
 * la fin des vagues au lieu de retarder son fondu.
 */
export const REVEAL_NAVIGATE_AT = 0.8

export interface RevealGeometry {
  /** Centre de départ : le centre du bouton Perle. */
  fromX: number
  fromY: number
  /** Rayon de départ, un peu plus petit que le bouton : le disque est caché dessous. */
  fromR: number
  /** Centre d'arrivée : le centre de l'écran. */
  toX: number
  toY: number
  /** Rayon d'arrivée : du centre au coin le plus loin, l'écran est couvert. */
  toR: number
}

/** Fenêtre d'une vague dans la progression globale (0 à 1). */
export interface RevealWave {
  start: number
  end: number
}

/**
 * Trois vagues : chacune dure 76 % de l'animation, la suivante part 12 % plus
 * tard. La dernière finit pile à 1, écran couvert. Ordre = ordre d'empilement
 * (la première est dessous et toujours la plus grande).
 */
export const REVEAL_WAVES: readonly RevealWave[] = [
  { start: 0, end: 0.76 },
  { start: 0.12, end: 0.88 },
  { start: 0.24, end: 1 },
]

export function revealGeometry(
  width: number,
  height: number,
  fabX: number,
  fabY: number,
  fabRadius: number,
): RevealGeometry {
  const toX = width / 2
  const toY = height / 2
  return {
    fromX: fabX,
    fromY: fabY,
    fromR: fabRadius * 0.9,
    toX,
    toY,
    // + 2 px : aucun liseré de l'écran du dessous dans les coins.
    toR: Math.hypot(toX, toY) + 2,
  }
}

/** Avancement (0 à 1) d'une vague pour une progression globale `p`. */
export function waveProgress(p: number, wave: RevealWave): number {
  'worklet'
  const t = (p - wave.start) / (wave.end - wave.start)
  return t <= 0 ? 0 : t >= 1 ? 1 : t
}

/**
 * Disque pour un avancement déjà adouci `e` : le centre glisse du bouton vers
 * le centre de l'écran pendant que le rayon grandit, donc le cercle monte en
 * s'élargissant au lieu de grossir sur place.
 */
export function discAt(e: number, g: RevealGeometry): { cx: number; cy: number; r: number } {
  'worklet'
  return {
    cx: g.fromX + (g.toX - g.fromX) * e,
    cy: g.fromY + (g.toY - g.fromY) * e,
    r: g.fromR + (g.toR - g.fromR) * e,
  }
}

/** Opacité du bouton Perle : visible pendant les vagues, s'efface quand la page arrive. */
export function fabOpacity(p: number): number {
  'worklet'
  const t = (p - 0.5) / 0.35
  return t <= 0 ? 1 : t >= 1 ? 0 : 1 - t
}
