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

  it('effet cocktail — 4 Orange déclenche pénalité supplémentaire', () => {
    // 4 Orange en fin de liste (positions 6-9 sur 10) : poids faibles ~0.2-0.45
    // Sans cocktail : ~16.5 environ. Avec cocktail (4-3=1 Orange extra) : -0.4
    const orangeEnd: M[] = [6, 7, 8, 9].map((p) => ({ color_rating: 'Orange', position: p }))
    const vSans = 20 - [6, 7, 8, 9].reduce((acc, p) => {
      const N = 10
      return acc + 2.0 * (Math.log(N - p + 1) / Math.log(N + 1))
    }, 0)
    const v = computeScore(orangeEnd, 10)
    // Doit être inférieur au score sans cocktail (effet négatif confirmé)
    expect(v).toBeLessThan(vSans)
    expect(v).toBeCloseTo(vSans - 0.4, 10)
  });

  it('effet cocktail — 3 Rouge déclenche pénalité (seuil = 2)', () => {
    const rouges: M[] = [8, 9, 10].map((p) => ({ color_rating: 'Rouge', position: p }))
    const vSans = 20 - [8, 9, 10].reduce((acc, p) => {
      const N = 11
      return acc + 4.0 * (Math.log(N - p + 1) / Math.log(N + 1))
    }, 0)
    const v = computeScore(rouges, 11)
    // 3 Rouge > seuil 2 → pénalité cocktail de 0.8 supplémentaire
    expect(v).toBeCloseTo(vSans - 0.8, 10)
  });

  it('effet cocktail — ≤3 Orange et ≤2 Rouge : aucune pénalité supplémentaire', () => {
    const matches: M[] = [
      { color_rating: 'Orange', position: 1 },
      { color_rating: 'Orange', position: 3 },
      { color_rating: 'Rouge', position: 5 },
    ]
    // En dessous des seuils (3 Orange, 2 Rouge) → cocktail = 0
    const N = 6
    const expected = 20
      - 2.0 * (Math.log(N - 1 + 1) / Math.log(N + 1))
      - 2.0 * (Math.log(N - 3 + 1) / Math.log(N + 1))
      - 4.0 * (Math.log(N - 5 + 1) / Math.log(N + 1))
    expect(computeScore(matches, N)).toBeCloseTo(expected, 10)
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
  it('0 → Faible / rose', () => {
    expect(scoreLabel(0)).toEqual({ label: 'Faible', tone: 'rose' })
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
