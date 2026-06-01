/**
 * Parité moteur routine mobile ↔ web (`lib/routine/engine.ts`).
 *
 * Modèle daily/weekly/monthly (PAS matin/soir). Valeurs golden calculées à la
 * main depuis la formule web :
 *   exposureScore = 20 - Σ(penaltyPerUse × FREQ_WEIGHT) / Σ(FREQ_WEIGHT)
 *   penaltyPerUse(score) = max(0, 20 - score)
 *   FREQ_WEIGHT = { daily: 1, weekly: 1/7, monthly: 1/30 }
 */
import { computeRoutineMetrics, type RoutineProduct } from '@/lib/routine/engine'
import type { AnalyseItem, AnalyseResponse } from '@/lib/analysis/types'

function item(partial: Partial<AnalyseItem> & { position: number }): AnalyseItem {
  return {
    position: partial.position,
    input: partial.input ?? partial.name ?? `ing-${partial.position}`,
    slug: partial.slug ?? null,
    name: partial.name ?? null,
    colorRating: partial.colorRating ?? null,
    dbColorRating: partial.dbColorRating ?? partial.colorRating ?? null,
    casNumber: partial.casNumber ?? null,
    translationFr: partial.translationFr ?? null,
    primaryFunction: partial.primaryFunction ?? null,
    allFunctions: partial.allFunctions,
    tags: partial.tags,
    matchKind: partial.matchKind,
    confidence: partial.confidence ?? 1,
    thresholdContext: partial.thresholdContext ?? null,
    thresholdLabel: partial.thresholdLabel ?? null,
  } as AnalyseItem
}

function response(args: {
  score: number
  counts: { vert: number; jaune: number; orange: number; rouge: number }
  items: AnalyseItem[]
}): AnalyseResponse {
  const { vert, jaune, orange, rouge } = args.counts
  const total = vert + jaune + orange + rouge
  return {
    counts: { total, matched: total, vert, jaune, orange, rouge, unknown: 0 },
    score: args.score,
    scoreLabel: '',
    scoreTone: 'green',
    items: args.items,
    observations: [],
    spectrum: { top5: [], top10: [] },
    synthesis: null,
  } as AnalyseResponse
}

describe('computeRoutineMetrics — routine vide', () => {
  it('renvoie un état neutre (20/20, Faible)', () => {
    const m = computeRoutineMetrics([])
    expect(m.exposureScore).toBe(20)
    expect(m.exposureLabel).toBe('Faible')
    expect(m.totalUseUnits).toBe(0)
    expect(m.simulation.removableCount).toBe(0)
  });
});

describe('computeRoutineMetrics — fixture 2 produits (golden)', () => {
  // Produit 1 : score 16/20, daily, 2 Vert + 1 Jaune
  // Produit 2 : score 10/20, weekly, 1 Orange + 1 Rouge (avec tags)
  const products: RoutineProduct[] = [
    {
      id: 'p1',
      name: 'Crème de jour',
      frequency: 'daily',
      score: 16,
      result: response({
        score: 16,
        counts: { vert: 2, jaune: 1, orange: 0, rouge: 0 },
        items: [
          item({ position: 0, name: 'Aqua', colorRating: 'Vert' }),
          item({ position: 1, name: 'Glycerin', colorRating: 'Vert' }),
          item({ position: 2, name: 'Phenoxyethanol', colorRating: 'Jaune', tags: ['conservateur'] }),
        ],
      }),
    },
    {
      id: 'p2',
      name: 'Gel douche',
      frequency: 'weekly',
      score: 10,
      result: response({
        score: 10,
        counts: { vert: 0, jaune: 0, orange: 1, rouge: 1 },
        items: [
          item({ position: 0, name: 'Sodium Laureth Sulfate', colorRating: 'Orange', tags: ['sulfate'] }),
          item({ position: 1, name: 'Limonene', input: 'Limonene', colorRating: 'Rouge', tags: ['allergene-parfumant'] }),
        ],
      }),
    },
  ]

  const m = computeRoutineMetrics(products)

  it('exposureScore = 15.3 (raw 15.25, arrondi 1 décimale)', () => {
    expect(m.exposureScore).toBe(15.3)
  });

  it('exposureLabel = Modérée (raw 15.25 ≥ 13)', () => {
    expect(m.exposureLabel).toBe('Modérée')
  });

  it('totalUseUnits = 1.14 (1 + 1/7)', () => {
    expect(m.totalUseUnits).toBe(1.14)
  });

  it('penalizingProductsCount = 1 (le produit score 10 < 13)', () => {
    expect(m.penalizingProductsCount).toBe(1)
  });

  it('colorCounts pondérés par fréquence', () => {
    expect(m.colorCounts.vert).toBeCloseTo(2, 10)
    expect(m.colorCounts.jaune).toBeCloseTo(1, 10)
    expect(m.colorCounts.orange).toBeCloseTo(1 / 7, 10)
    expect(m.colorCounts.rouge).toBeCloseTo(1 / 7, 10)
  });

  it('tagExposure trié par exposition cumulée décroissante', () => {
    const tags = m.tagExposure.map((t) => t.tag)
    expect(tags).toContain('conservateur')
    expect(tags).toContain('sulfate')
    // conservateur est sur le produit daily (poids 1) → plus haut que sulfate (weekly 1/7)
    expect(m.tagExposure[0].tag).toBe('conservateur')
    expect(m.tagExposure[0].cumulativeCount).toBe(1)
  });

  it('topIngredients exclut les Vert et classe par exposition pondérée', () => {
    const names = m.topIngredients.map((i) => i.name)
    expect(names).not.toContain('Aqua')
    expect(names).not.toContain('Glycerin')
    // Jaune daily : 0.6×1 = 0.6 ; Orange weekly : 2.0×(1/7) = 0.2857 ; Rouge weekly : 4.0×(1/7)=0.5714
    expect(m.topIngredients[0].name).toBe('Phenoxyethanol')
  });

  it('simulation : 1 produit pénalisant retirable (Rouge présent + score < 13)', () => {
    expect(m.simulation.removableCount).toBe(1)
    expect(m.simulation.minus1.removedName).toBe('Gel douche')
  });
});

describe('computeRoutineMetrics — chevauchement allergènes UE', () => {
  it('signale un allergène présent dans 2 produits', () => {
    const mk = (id: string): RoutineProduct => ({
      id,
      name: id,
      frequency: 'daily',
      score: 18,
      result: response({
        score: 18,
        counts: { vert: 1, jaune: 1, orange: 0, rouge: 0 },
        items: [
          item({ position: 0, name: 'Aqua', colorRating: 'Vert' }),
          item({ position: 1, name: 'LIMONENE', input: 'LIMONENE', colorRating: 'Jaune' }),
        ],
      }),
    })
    const m = computeRoutineMetrics([mk('a'), mk('b')])
    const limonene = m.allergenOverlap.find((a) => a.inciName === 'LIMONENE')
    expect(limonene).toBeDefined()
    expect(limonene!.productCount).toBe(2)
  });
});
