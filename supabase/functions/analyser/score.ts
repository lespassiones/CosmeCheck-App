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

export function computeScore(
  matches: { color_rating: ColorRating | null; position: number }[],
  totalPositions: number,
): number {
  if (totalPositions === 0) return 0;
  let score = 20;
  let countOrange = 0;
  let countRouge = 0;
  for (const m of matches) {
    if (!m.color_rating) continue;
    const p = m.position;
    const N = Math.max(totalPositions, 1);
    const weight = Math.log(N - p + 1) / Math.log(N + 1);
    score -= PENALTY[m.color_rating] * weight;
    if (m.color_rating === "Orange") countOrange++;
    if (m.color_rating === "Rouge") countRouge++;
  }
  // Effet cocktail : pénalité supplémentaire quand les ingrédients problématiques
  // s'accumulent, indépendamment de leur position (aligné sur INCI Beauty).
  score -= Math.max(0, countOrange - 3) * 0.4;
  score -= Math.max(0, countRouge - 2) * 0.8;
  return Math.max(0, Math.min(20, score));
}

/** Map a numeric score (0-20) to a qualitative label + tone. Seuils ≥17/≥13/≥9. */
export function scoreLabel(score: number): { label: string; tone: ScoreTone } {
  if (score >= 17) return { label: "Très bien", tone: "green" };
  if (score >= 13) return { label: "Bien", tone: "amber" };
  if (score >= 9) return { label: "Moyen", tone: "orange" };
  return { label: "À éviter", tone: "rose" };
}
