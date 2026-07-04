/**
 * NEUTRALISÉ (juillet 2026) — le color cap n'est PLUS appliqué.
 *
 * Depuis le passage à la notation propriétaire par PASTILLE, le score (0-20) est
 * déjà synthétisé dans la bande de la pastille, qui intègre le plafond PAR
 * POSITION (moteur `lib/analysis/pastille.ts`). Re-plafonner ici (règle aveugle
 * à la position : ≥1 rouge → 8.9) sur-pénaliserait à tort un produit dont le
 * rouge est en fin de liste, et divergerait du score du catalogue.
 *
 * On garde la fonction (signature inchangée) pour ne pas casser les appelants
 * (recommandations, alternatives, routine, recherche) : elle renvoie désormais
 * le score tel quel. À supprimer quand tous les appels auront été retirés.
 */
export function applyColorCap(
  score: number,
  _countOrange: number,
  _countRouge: number,
): number {
  return score
}

/** Libellé court depuis un score (mêmes seuils que l'app : 17/13/9). */
export function scoreLabelFromScore(score: number): string {
  if (score >= 17) return 'Très bien'
  if (score >= 13) return 'Bien'
  if (score >= 9) return 'Moyen'
  return 'Faible'
}
