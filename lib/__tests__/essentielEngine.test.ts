/**
 * Parité moteur "essentiel" mobile ↔ web (`lib/essentiel/engine.ts`).
 *
 * On vérifie les seuils de verdict (pickTone) et la résolution des verbes
 * contextuels (positives), qui pilotent la carte "L'essentiel".
 */
import { computeEssentiel } from '@/lib/essentiel/engine'
import type { AnalyseItem, AnalyseResponse } from '@/lib/analysis/types'

function item(partial: Partial<AnalyseItem> & { position: number }): AnalyseItem {
  return {
    position: partial.position,
    input: partial.input ?? partial.name ?? `ing-${partial.position}`,
    slug: partial.slug ?? null,
    name: partial.name ?? null,
    colorRating: partial.colorRating ?? null,
    dbColorRating: partial.dbColorRating ?? partial.colorRating ?? null,
    casNumber: null,
    translationFr: partial.translationFr ?? null,
    primaryFunction: partial.primaryFunction ?? null,
    allFunctions: partial.allFunctions,
    tags: partial.tags,
    matchKind: partial.matchKind,
    confidence: 1,
    thresholdContext: null,
    thresholdLabel: null,
  } as AnalyseItem
}

function resp(
  counts: { vert: number; jaune: number; orange: number; rouge: number; matched?: number },
  items: AnalyseItem[] = [],
): AnalyseResponse {
  const total = counts.vert + counts.jaune + counts.orange + counts.rouge
  return {
    counts: {
      total,
      matched: counts.matched ?? total,
      vert: counts.vert,
      jaune: counts.jaune,
      orange: counts.orange,
      rouge: counts.rouge,
      unknown: 0,
    },
    score: 0,
    scoreLabel: '',
    scoreTone: 'green',
    items,
    observations: [],
    spectrum: { top5: [], top10: [] },
    synthesis: null,
  } as AnalyseResponse
}

describe('computeEssentiel — seuils de verdict (tone)', () => {
  it('matched 0 → unknown', () => {
    expect(computeEssentiel(resp({ vert: 0, jaune: 0, orange: 0, rouge: 0, matched: 0 })).verdict.tone).toBe('unknown')
  });
  it('aucun problème → very-safe', () => {
    expect(computeEssentiel(resp({ vert: 5, jaune: 0, orange: 0, rouge: 0 })).verdict.tone).toBe('very-safe')
  });
  it('1 jaune → safe', () => {
    expect(computeEssentiel(resp({ vert: 3, jaune: 1, orange: 0, rouge: 0 })).verdict.tone).toBe('safe')
  });
  it('4 jaunes → caution', () => {
    expect(computeEssentiel(resp({ vert: 1, jaune: 4, orange: 0, rouge: 0 })).verdict.tone).toBe('caution')
  });
  it('1 orange → warning', () => {
    expect(computeEssentiel(resp({ vert: 1, jaune: 0, orange: 1, rouge: 0 })).verdict.tone).toBe('warning')
  });
  it('3 oranges → danger', () => {
    expect(computeEssentiel(resp({ vert: 1, jaune: 0, orange: 3, rouge: 0 })).verdict.tone).toBe('danger')
  });
  it('1 rouge → danger', () => {
    expect(computeEssentiel(resp({ vert: 1, jaune: 0, orange: 0, rouge: 1 })).verdict.tone).toBe('danger')
  });
  it('2 rouges → high-risk', () => {
    expect(computeEssentiel(resp({ vert: 1, jaune: 0, orange: 0, rouge: 2 })).verdict.tone).toBe('high-risk')
  });
});

describe('computeEssentiel — positives (verbes)', () => {
  it('max 3 ingrédients verts avec verbe, triés par position', () => {
    const items = [
      item({ position: 0, name: 'Aqua', colorRating: 'Vert', allFunctions: ['Solvant'] }),
      item({ position: 1, name: 'Glycerin', colorRating: 'Vert', allFunctions: ['Humectant'] }),
      item({ position: 2, name: 'Tocopherol', colorRating: 'Vert', allFunctions: ['Antioxydant'] }),
      item({ position: 3, name: 'Panthenol', colorRating: 'Vert', allFunctions: ['Humectant'] }),
    ]
    const e = computeEssentiel(resp({ vert: 4, jaune: 0, orange: 0, rouge: 0 }, items))
    expect(e.positives).toHaveLength(3)
    expect(e.positives[0].verb).toBe('dissout les autres ingrédients de la formule')
    expect(e.positives[1].verb).toBe('attire l\'eau dans la peau')
  });

  it('verbe contextuel : "Antistatique" sauté hors capillaire (default null)', () => {
    const items = [
      item({ position: 0, name: 'X', colorRating: 'Vert', allFunctions: ['Antistatique'] }),
      item({ position: 1, name: 'Glycerin', colorRating: 'Vert', allFunctions: ['Humectant'] }),
    ]
    // catégorie creme_visage → Antistatique n'a pas de verbe → sauté
    const e = computeEssentiel(resp({ vert: 2, jaune: 0, orange: 0, rouge: 0 }, items), {
      category: 'creme_visage',
    })
    expect(e.positives.map((p) => p.name)).not.toContain('X')
    // "Glycerin" est ré-écrit en nom commun FR via inciCommonNames → "Glycérine"
    expect(e.positives.map((p) => p.name)).toContain('Glycérine')
  });
});

describe('computeEssentiel — concerns', () => {
  it('mappe un tag problématique vers famille + effet', () => {
    const items = [
      item({ position: 0, name: 'Sodium Laureth Sulfate', colorRating: 'Orange', tags: ['sulfate'] }),
    ]
    const e = computeEssentiel(resp({ vert: 0, jaune: 0, orange: 1, rouge: 0 }, items))
    const orange = e.concerns.find((c) => c.tier === 'orange')
    expect(orange?.family).toBe('Sulfates')
    expect(orange?.effect).toBe('peuvent dessécher la peau et le cuir chevelu')
  });
});
