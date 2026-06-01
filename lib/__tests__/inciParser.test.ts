/**
 * Parité scoring INCI mobile ↔ web (`lib/inciParser.ts`).
 *
 * Les valeurs "golden" attendues sont dérivées à la main à partir de la
 * formule du web :
 *   score = 20 - Σ PENALTY[color] × weight(p)
 *   weight(p) = log(N - p + 1) / log(N + 1)
 *   PENALTY = { Vert: 0, Jaune: 0.6, Orange: 2.0, Rouge: 4.0 }
 */
import {
  computeScore,
  scoreLabel,
  parseInciList,
  type ColorRating,
} from '@/lib/inci/parser'

type M = { color_rating: ColorRating | null; position: number }

describe('computeScore — parité web (valeurs golden)', () => {
  it('5 ingrédients tous Vert → 20 (aucune pénalité)', () => {
    const matches: M[] = [0, 1, 2, 3, 4].map((p) => ({ color_rating: 'Vert', position: p }))
    expect(computeScore(matches, 5)).toBe(20)
  });

  it('1 Rouge en position 0 sur 5 → 16 exactement (poids = 1.0)', () => {
    // weight(5,0) = log(6)/log(6) = 1 → 20 - 4.0×1 = 16
    expect(computeScore([{ color_rating: 'Rouge', position: 0 }], 5)).toBe(16)
  });

  it('Jaune pos1 + Orange pos3 sur 5 → ~18.2348', () => {
    // 20 - (0.6×0.8982444017 + 2.0×0.6131471928) = 18.234758973...
    const v = computeScore(
      [
        { color_rating: 'Jaune', position: 1 },
        { color_rating: 'Orange', position: 3 },
      ],
      5,
    )
    expect(v).toBeCloseTo(18.234758973446727, 10)
  });

  it('1 Rouge en position 2 sur 10 → ~16.3347', () => {
    // 20 - 4.0×(log(9)/log(11)) = 16.33474472...
    const v = computeScore([{ color_rating: 'Rouge', position: 2 }], 10)
    expect(v).toBeCloseTo(16.33474472006939, 10)
  });

  it('totalPositions = 0 → 0', () => {
    expect(computeScore([], 0)).toBe(0)
  });

  it('matches null color_rating ignorés', () => {
    expect(computeScore([{ color_rating: null, position: 0 }], 5)).toBe(20)
  });

  it('score borné dans [0, 20]', () => {
    const allRouge: M[] = [0, 1, 2].map((p) => ({ color_rating: 'Rouge', position: p }))
    const v = computeScore(allRouge, 3)
    expect(v).toBeGreaterThanOrEqual(0)
    expect(v).toBeLessThanOrEqual(20)
  });
});

describe('scoreLabel — seuils web (≥17 / ≥13 / ≥9)', () => {
  it('20 → Très bien / green', () => {
    expect(scoreLabel(20)).toEqual({ label: 'Très bien', tone: 'green' })
  });
  it('17 (borne) → green', () => {
    expect(scoreLabel(17).tone).toBe('green')
  });
  it('16.999 → amber', () => {
    expect(scoreLabel(16.999).tone).toBe('amber')
  });
  it('13 (borne) → amber', () => {
    expect(scoreLabel(13)).toEqual({ label: 'Bien', tone: 'amber' })
  });
  it('12.999 → orange', () => {
    expect(scoreLabel(12.999).tone).toBe('orange')
  });
  it('9 (borne) → orange', () => {
    expect(scoreLabel(9)).toEqual({ label: 'Moyen', tone: 'orange' })
  });
  it('8.999 → rose', () => {
    expect(scoreLabel(8.999).tone).toBe('rose')
  });
  it('0 → À éviter / rose', () => {
    expect(scoreLabel(0)).toEqual({ label: 'À éviter', tone: 'rose' })
  });
});

describe('parseInciList — comportement de parsing', () => {
  it('parse une liste basique séparée par des virgules', () => {
    const toks = parseInciList('Aqua, Glycerin, Parfum')
    expect(toks.map((t) => t.normalized)).toEqual(['AQUA', 'GLYCERIN', 'PARFUM'])
    expect(toks.map((t) => t.position)).toEqual([0, 1, 2])
  });

  it('découpe les synonymes " / " entourés d\'espaces', () => {
    const toks = parseInciList('Aqua / Water, Glycerin')
    expect(toks.map((t) => t.normalized)).toEqual(['AQUA', 'WATER', 'GLYCERIN'])
  });

  it('préserve les noms composés INCI numériques (slash + chiffres)', () => {
    // Parité web : les chiffres cassent le motif [A-Za-z] avant le slash, donc
    // "PEG-10/PPG-10 Dimethicone" reste un seul token (pas de split).
    const toks = parseInciList('PEG-10/PPG-10 Dimethicone, Glycerin')
    expect(toks[0].normalized).toBe('PEG-10/PPG-10 DIMETHICONE')
  });

  it('découpe "Aqua/Water" (mots simples slashés sans espace)', () => {
    const toks = parseInciList('Aqua/Water, Glycerin')
    expect(toks.map((t) => t.normalized)).toEqual(['AQUA', 'WATER', 'GLYCERIN'])
  });

  it('retire le label "INGREDIENTS:" en tête', () => {
    const toks = parseInciList('INGREDIENTS: Aqua, Glycerin')
    expect(toks.map((t) => t.normalized)).toEqual(['AQUA', 'GLYCERIN'])
  });

  it('déduplique les tokens normalisés identiques', () => {
    const toks = parseInciList('Aqua, AQUA, Aqua')
    expect(toks).toHaveLength(1)
  });

  it('strippe les préfixes descriptifs (Organic, Vegetable…)', () => {
    const toks = parseInciList('Organic Coconut Oil')
    expect(toks[0].normalized).toBe('COCONUT OIL')
    // raw conservé pour l'affichage
    expect(toks[0].raw).toBe('Organic Coconut Oil')
  });

  it('texte vide → []', () => {
    expect(parseInciList('')).toEqual([])
  });
});
