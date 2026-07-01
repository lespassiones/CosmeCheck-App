/**
 * Plancher de sécurité par couleur — version client (miroir de
 * supabase/functions/analyser/score.ts:applyColorCap). Indépendant de la position :
 *   - ≥ 1 rouge   OU  ≥ 3 orange → pastille au max "triangle" (score < 9)
 *   - 1 ou 2 orange              → pastille au max "œil"      (score < 13)
 * Ne fait que PLAFONNER (jamais remonter). Utilisé pour que l'écran d'analyse
 * ET les recommandations affichent la même note plafonnée.
 */
export function applyColorCap(
  score: number,
  countOrange: number,
  countRouge: number,
): number {
  if (countRouge >= 1 || countOrange >= 3) return Math.min(score, 8.9)
  if (countOrange >= 1) return Math.min(score, 12.9)
  return score
}

/** Libellé court depuis un score (mêmes seuils que l'app : 17/13/9). */
export function scoreLabelFromScore(score: number): string {
  if (score >= 17) return 'Très bien'
  if (score >= 13) return 'Bien'
  if (score >= 9) return 'Moyen'
  return 'Faible'
}
