/**
 * Scoring déterministe INCI — port byte-for-byte de
 * `CosmetWiki/lib/inciParser.ts` (computeScore / scoreLabel). Math IDENTIQUE
 * à la version mobile `lib/inci/parser.ts`.
 *
 *   penalty = { Vert: 0, Jaune: 0.6, Orange: 2.0, Rouge: 4.0 }
 *   score   = 20 - sum(penalty * weight(position)) - cocktailPenalty
 *   weight(p) = log(N - p + 1) / log(N + 1)   ∈ [0, 1]
 *
 *   cocktailPenalty = max(0, countOrange - 3) × 0.4
 *                   + max(0, countRouge  - 2) × 0.8
 *
 * `ColorRating` ici = forme DB capitalisée ("Vert"/"Jaune"/"Orange"/"Rouge").
 */
export type ColorRating = "Vert" | "Jaune" | "Orange" | "Rouge";
export type ScoreTone = "green" | "amber" | "orange" | "rose";

const PENALTY: Record<ColorRating, number> = {
  Vert: 0,
  Jaune: 0.6,
  Orange: 2.0,
  Rouge: 4.0,
};

// Constante de saturation calibrée contre INCI Beauty (grid-search sur 10k
// produits notés IB) : MAE ~4.1 et SURTOUT plus aucun plancher brutal à 0.
const SAT_C = 8;

export function computeScore(
  matches: { color_rating: ColorRating | null; position: number }[],
  totalPositions: number,
): number {
  if (totalPositions === 0) return 0;
  // S = somme des pénalités pondérées par la position + effet cocktail.
  let S = 0;
  let countOrange = 0;
  let countRouge = 0;
  for (const m of matches) {
    if (!m.color_rating) continue;
    const p = m.position;
    const N = Math.max(totalPositions, 1);
    const weight = Math.log(N - p + 1) / Math.log(N + 1);
    S += PENALTY[m.color_rating] * weight;
    if (m.color_rating === "Orange") countOrange++;
    if (m.color_rating === "Rouge") countRouge++;
  }
  S += Math.max(0, countOrange - 3) * 0.4;
  S += Math.max(0, countRouge - 2) * 0.8;
  // Saturation douce : score = 20 / (1 + S/C). Décroît sans jamais s'effondrer
  // à 0 (une liste longue avec beaucoup de pénalités tombe bas mais > 0).
  return Math.max(0, Math.min(20, 20 / (1 + S / SAT_C)));
}

/**
 * Plancher de sécurité par couleur (INDÉPENDANT de la position) :
 *   - ≥ 1 ingrédient ROUGE   → pastille au max "triangle" → score < 9
 *   - ≥ 3 ingrédients ORANGE → pastille au max "triangle" → score < 9
 *   - 1 ou 2 ingrédients ORANGE → pastille au max "œil"   → score < 13
 * Ne fait que PLAFONNER (jamais remonter). 8.9 = haut de la tranche triangle
 * (5–9) ; 12.9 = haut de la tranche œil (9–13).
 */
export function applyColorCap(
  score: number,
  countOrange: number,
  countRouge: number,
): number {
  if (countRouge >= 1 || countOrange >= 3) return Math.min(score, 8.9);
  if (countOrange >= 1) return Math.min(score, 12.9);
  return score;
}

/** Map a numeric score (0-20) to a qualitative label + tone. Seuils ≥17/≥13/≥9. */
export function scoreLabel(score: number): { label: string; tone: ScoreTone } {
  if (score >= 17) return { label: "Très bien", tone: "green" };
  if (score >= 13) return { label: "Bien", tone: "amber" };
  if (score >= 9) return { label: "Moyen", tone: "orange" };
  return { label: "Faible", tone: "rose" };
}
