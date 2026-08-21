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
 * Réconciliation score catalogue ↔ couleurs AFFICHÉES — miroir client de
 * `analyser/score.ts` reconcileScore (et du web `lib/inciParser.ts`).
 *
 * Pourquoi côté client aussi : l'Edge Function applique déjà cette règle et
 * persiste sa décision dans `result_json.score`. Mais l'écran d'analyse
 * re-résolvait `catalog.score` à l'affichage et l'imposait aux étoiles, ce qui
 * ANNULAIT la décision serveur. Cas vu en bêta (Yepoda The Calm Balm) : analyse
 * servie 16,55 « Bien » avec un top5 tout vert, catalogue 12,9 → le mobile
 * affichait 3 étoiles ambres quand le web en affichait 4 vertes, et les étoiles
 * contredisaient les couleurs juste en dessous.
 *
 * On sert le score catalogue (curation = source de vérité) UNIQUEMENT s'il tombe
 * dans la même bande que le score servi ; sinon on garde ce dernier, pour que la
 * note corresponde toujours aux couleurs affichées. Garde : ≥50 % d'ingrédients
 * identifiés, sinon le coloriage n'est pas fiable et le catalogue reste maître.
 */
export function reconcileScore(
  catalogScore: number,
  servedScore: number | null | undefined,
  matched: number,
  total: number,
): number {
  if (servedScore == null || Number.isNaN(servedScore)) return catalogScore
  const identRatio = total > 0 ? matched / total : 0
  if (identRatio < 0.5) return catalogScore
  return scoreToneFromScore(catalogScore) === scoreToneFromScore(servedScore)
    ? catalogScore
    : servedScore
}
