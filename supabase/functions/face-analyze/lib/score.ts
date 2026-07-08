/**
 * Score global d'un scan visage (Edge Function `face-analyze`).
 *
 * Module FEUILLE : zéro import, zéro global Deno. Même convention que
 * lib/skin/score.ts côté client (décision n°5 du design) : chaque dimension
 * est un score 0-100 où 100 = idéal ; le global est la moyenne ARRONDIE des
 * 5 dimensions, chacune bornée à [0, 100] par défense (le modèle vision peut
 * déborder malgré le clamp de parse.ts si ce module est appelé ailleurs).
 */

/** 5 dimensions 0-100, 100 = idéal (miroir de parse.ts / lib/skin/score.ts). */
export type ScanDimScores = {
  imperfections: number
  rougeurs: number
  secheresse: number
  brillance: number
  douceur: number
}

const DIMS: readonly (keyof ScanDimScores)[] = [
  'imperfections',
  'rougeurs',
  'secheresse',
  'brillance',
  'douceur',
]

function clampScore(v: number): number {
  if (!Number.isFinite(v)) return 0
  return Math.min(100, Math.max(0, v))
}

/** Global du scan = moyenne arrondie des 5 dimensions bornées à [0, 100]. */
export function scanGlobal(metrics: ScanDimScores): number {
  let sum = 0
  for (const dim of DIMS) sum += clampScore(metrics[dim])
  return Math.round(sum / DIMS.length)
}
