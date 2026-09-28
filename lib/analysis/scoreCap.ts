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

/** Tonalité de la bande de qualité. Miroir exact de `analyser/score.ts` scoreLabel
 *  (« Très bien » et « Bien » partagent la bande verte). */
export type ScoreBandTone = 'green' | 'amber' | 'orange' | 'rose'
export function scoreToneFromScore(score: number): ScoreBandTone {
  if (score >= 13) return 'green'
  if (score >= 9) return 'amber'
  if (score >= 5) return 'orange'
  return 'rose'
}

/**
 * SCORE AFFICHÉ = LE SCORE CATALOGUE, POINT. Miroir client de
 * `analyser/score.ts` resolveDisplayScore.
 *
 * Règle produit (14 sept 2026, arbitrage bêta) : l'app LIT les notes déjà
 * calculées, elle n'en recalcule aucune à l'affichage. Le catalogue gagne dès
 * qu'il porte une note ; le score servi par l'analyse (result_json) ne sert que
 * pour un produit ABSENT du catalogue ou catalogué sans note.
 *
 * Ce que ça remplace : l'ancien `reconcileScore` gardait le score servi quand il
 * tombait dans une autre bande que le catalogue. Résultat vu en bêta (Stela,
 * 12 sept) : Anua Azelaic Acid 10 affiché « Moyen » (œil jaune) dans la
 * recherche et « 4 étoiles vertes » sur sa fiche. Une note unique partout prime
 * sur une note « plus juste » sur un seul écran : `routine-smart-suggest`
 * qualifie les produits sur la note catalogue, donc diverger cassait aussi les
 * recommandations.
 *
 * Si le catalogue est faux, on corrige LA LIGNE CATALOGUE (re-score hors ligne),
 * on ne diverge pas à l'affichage.
 */
export function resolveDisplayScore(
  catalogScore: number | null | undefined,
  servedScore: number | null | undefined,
): number | null {
  if (catalogScore != null && !Number.isNaN(catalogScore)) return catalogScore
  return servedScore != null && !Number.isNaN(servedScore) ? servedScore : null
}
