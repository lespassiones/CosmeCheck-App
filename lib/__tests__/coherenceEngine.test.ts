/**
 * Parité moteur cohérence mobile ↔ web (`lib/coherence/engine.ts` + `claims.ts`).
 *
 * Valeurs golden du barème unifié (unifiedScore) :
 *   - tenue (≥1 actif documenté bien dosé) → 80 (+5 par actif supplémentaire)
 *   - partielle (documenté uniquement en trace) → 35
 *   - marketing (actif cosmétique uniquement) → 20
 *   - non_demontree → 0
 *   - absence tenue → 100 ; absence contredite → 0
 *
 * computeMetrics :
 *   tenuePct = round((tenue + partielle) / total × 100)
 *   marketingIndex = round((marketing + non_demontree + contredite) / total × 100)
 */
import {
  resolvePromise,
  resolveAbsencePromise,
  computeMetrics,
  type LlmPromiseProposal,
} from '@/lib/coherence/engine'
import { findCategoryBySlug } from '@/lib/coherence/claims'
import type { CoherencePromise } from '@/lib/coherence/types'
import type { AnalyseItem } from '@/lib/analysis/types'

function item(partial: Partial<AnalyseItem> & { position: number }): AnalyseItem {
  return {
    position: partial.position,
    input: partial.input ?? partial.name ?? `ing-${partial.position}`,
    slug: partial.slug ?? null,
    name: partial.name ?? null,
    colorRating: partial.colorRating ?? null,
    dbColorRating: partial.dbColorRating ?? partial.colorRating ?? null,
    casNumber: null,
    translationFr: null,
    primaryFunction: null,
    allFunctions: partial.allFunctions,
    tags: partial.tags,
    matchKind: partial.matchKind,
    confidence: 1,
    thresholdContext: partial.thresholdContext ?? null,
    thresholdLabel: null,
  } as AnalyseItem
}

const HYDRATATION: LlmPromiseProposal = {
  category_slug: 'hydratation',
  label: 'Hydratation',
  excerpt: 'hydrate intensément',
}

describe('resolvePromise — barème unifié (golden)', () => {
  it('actif documenté présent et bien dosé → verdict tenue, score 80', () => {
    // glycerin est "documented" dans la catégorie hydratation ; bien dosé (avant seuil)
    const items = [
      item({ position: 0, slug: 'aqua', name: 'Aqua', colorRating: 'Vert' }),
      item({ position: 1, slug: 'glycerin', name: 'Glycerin', colorRating: 'Vert', thresholdContext: 'before_fragrance' }),
    ]
    const p = resolvePromise(HYDRATATION, items)
    expect(p.verdict).toBe('tenue')
    expect(p.score).toBe(80)
    expect(p.foundActives.map((f) => f.slug)).toContain('glycerin')
  });

  it('actif documenté présent mais EN TRACE → verdict partielle, score 35', () => {
    const items = [
      item({ position: 0, slug: 'parfum', name: 'Parfum', tags: ['parfum-synthese'] }),
      item({ position: 1, slug: 'glycerin', name: 'Glycerin', thresholdContext: 'after_fragrance' }),
    ]
    const p = resolvePromise(HYDRATATION, items)
    expect(p.verdict).toBe('partielle')
    expect(p.score).toBe(35)
  });

  it('aucun actif documenté trouvé → non_demontree, score 0', () => {
    const items = [item({ position: 0, slug: 'paraffinum-liquidum', name: 'Paraffinum Liquidum' })]
    const p = resolvePromise(HYDRATATION, items)
    expect(p.verdict).toBe('non_demontree')
    expect(p.score).toBe(0)
    expect(p.foundActives).toHaveLength(0)
  });

  it('2 actifs bien dosés → tenue, score 85 (80 + 5)', () => {
    const items = [
      item({ position: 0, slug: 'glycerin', name: 'Glycerin', thresholdContext: 'before_fragrance' }),
      item({ position: 1, slug: 'panthenol', name: 'Panthenol', thresholdContext: 'before_fragrance' }),
    ]
    const p = resolvePromise(HYDRATATION, items)
    expect(p.verdict).toBe('tenue')
    expect(p.score).toBe(85)
  });

  it('catégorie hors-catalogue → non_demontree', () => {
    const p = resolvePromise(
      { category_slug: 'autre', label: 'Tient 12h', excerpt: 'tenue longue durée' },
      [item({ position: 0, name: 'Aqua' })],
    )
    expect(p.verdict).toBe('non_demontree')
  });
});

describe('resolveAbsencePromise — promesse "sans X"', () => {
  const cat = findCategoryBySlug('absence_sulfate')!

  it('aucun sulfate dans la formule → tenue, score 100', () => {
    const items = [item({ position: 0, slug: 'glycerin', name: 'Glycerin' })]
    const p = resolveAbsencePromise({ category_slug: 'absence_sulfate', label: 'Sans sulfate', excerpt: 'sans sulfate' }, cat, items)
    expect(p.verdict).toBe('tenue')
    expect(p.score).toBe(100)
  });

  it('un sulfate présent → contredite, score 0, ingrédient nommé', () => {
    const items = [
      item({ position: 0, slug: 'sodium-laureth-sulfate', name: 'Sodium Laureth Sulfate', tags: ['sulfate'] }),
    ]
    const p = resolveAbsencePromise({ category_slug: 'absence_sulfate', label: 'Sans sulfate', excerpt: 'sans sulfate' }, cat, items)
    expect(p.verdict).toBe('contredite')
    expect(p.score).toBe(0)
    expect(p.contradictingActives?.[0].name).toBe('Sodium Laureth Sulfate')
  });
});

describe('computeMetrics — agrégats & seuils de tone', () => {
  function promise(verdict: CoherencePromise['verdict']): CoherencePromise {
    return {
      slug: 's',
      label: 'l',
      excerpt: 'e',
      verdict,
      expectedActives: [],
      foundActives: [],
      cosmeticActives: [],
      missingActives: [],
      score: 0,
    }
  }

  it('tenuePct = (tenue + partielle) / total', () => {
    const m = computeMetrics([
      promise('tenue'),
      promise('partielle'),
      promise('marketing'),
      promise('non_demontree'),
    ])
    expect(m.totalPromises).toBe(4)
    expect(m.tenueCount).toBe(1)
    expect(m.partielleCount).toBe(1)
    expect(m.tenuePct).toBe(50) // (1+1)/4
    expect(m.marketingIndex).toBe(50) // (1 marketing + 1 non_demontree)/4
  });

  it('contredite compte dans marketingIndex (pas dans tenuePct)', () => {
    const m = computeMetrics([promise('tenue'), promise('contredite')])
    expect(m.contrediteCount).toBe(1)
    expect(m.tenuePct).toBe(50)
    expect(m.marketingIndex).toBe(50)
  });

  it('tenuePct + marketingIndex = 100 (symétrie)', () => {
    const m = computeMetrics([
      promise('tenue'),
      promise('tenue'),
      promise('marketing'),
      promise('non_demontree'),
      promise('contredite'),
    ])
    expect(m.tenuePct + m.marketingIndex).toBe(100)
  });

  it('liste vide → tenuePct 0, marketingIndex 100', () => {
    const m = computeMetrics([])
    expect(m.tenuePct).toBe(0)
    expect(m.marketingIndex).toBe(100)
  });
});
