/**
 * COLOR CAP — filet d'affichage par INVARIANTS de la pastille (réactivé 16 juil
 * 2026 après l'incident « feuille verte avec 2 rouges », 870 notes corrompues
 * en base recalculées).
 *
 * Historique : neutralisé en juillet car l'ancien cap (≥1 rouge → 8,9) était
 * AVEUGLE À LA POSITION et sur-pénalisait un rouge en fin de liste. Mais sans
 * AUCUN filet, une note stockée corrompue (ex. 13,56 avec 2 rouges) s'affichait
 * « verte ». On ne remet PAS l'ancien cap : on applique uniquement les bornes
 * que le moteur pastille (lib/analysis/pastille.ts) ne peut JAMAIS dépasser,
 * quelle que soit la position des ingrédients :
 *   - ≥1 rouge  → au mieux « caution » (un rouge en Queue plafonne à Jaune)  → ≤ 12,9
 *   - ≥2 rouges → au mieux « warning » (plafond ≥ Orange)                    → ≤ 8,9
 *   - ≥4 oranges → au mieux « warning »                                      → ≤ 8,9
 * Un produit SAIN n'est jamais modifié (sa note respecte déjà ces bornes) ;
 * seule une note corrompue est rabattue. Zéro sur-pénalisation.
 */
export function applyColorCap(
  score: number,
  countOrange: number,
  countRouge: number,
): number {
  let cap = Number.POSITIVE_INFINITY
  if (countRouge >= 2 || countOrange >= 4) cap = 8.9
  else if (countRouge >= 1) cap = 12.9
  return Math.min(score, cap)
}

/** Libellé court depuis un score (mêmes seuils que l'app : 17/13/9). */
export function scoreLabelFromScore(score: number): string {
  if (score >= 17) return 'Très bien'
  if (score >= 13) return 'Bien'
  if (score >= 9) return 'Moyen'
  return 'Faible'
}
