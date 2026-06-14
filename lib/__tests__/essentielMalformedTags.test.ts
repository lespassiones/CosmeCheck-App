/**
 * RÉGRESSION — crash prod « iterator method is not callable » (écran d'analyse).
 *
 * Cause racine (investiguée 14 juin 2026) : un enrichissement ETL Wikidata
 * (2026-05-26) a écrit le champ `tags` de certains ingrédients dans les analyses
 * CACHÉES (`cosme_check.product_analyses.result_json`) sous forme d'OBJET de
 * métadonnées { wikidata_qid, wikidata_enriched_at } au lieu du tableau de tags
 * attendu. `computeEssentiel` → `buildConcern` fait `for (const tag of it.tags ?? [])` :
 * `?? []` ne rattrape que null/undefined, donc un OBJET passe → `for...of` sur un
 * objet jette « iterator method is not callable » (Hermes) / « is not iterable » (V8).
 *
 * Mesuré : ~6% des produits recommandés ont un item Jaune/Orange/Rouge avec ces
 * tags-objet → crash intermittent au clic. La colonne `ingredients.tags` (text[])
 * est saine ; seules les analyses cachées sont touchées.
 *
 * Ce test reproduit le crash et garantit, une fois le correctif appliqué
 * (ex. `Array.isArray(it.tags) ? it.tags : []`), qu'il ne reviendra plus.
 */
import { computeEssentiel } from '@/lib/essentiel/engine'
import type { AnalyseItem, AnalyseResponse } from '@/lib/analysis/types'

// Forme EXACTE observée en prod (product_analyses.result_json -> items[].tags).
const WIKIDATA_OBJECT_TAGS = {
  wikidata_qid: 'Q193572',
  wikidata_enriched_at: '2026-05-26T13:11:01.268328+00:00',
} as unknown as string[]

function item(p: Partial<AnalyseItem> & { position: number }): AnalyseItem {
  return {
    position: p.position,
    input: p.input ?? p.name ?? `ing-${p.position}`,
    slug: p.slug ?? null,
    name: p.name ?? null,
    colorRating: p.colorRating ?? null,
    dbColorRating: p.dbColorRating ?? p.colorRating ?? null,
    casNumber: null,
    translationFr: null,
    primaryFunction: p.primaryFunction ?? null,
    allFunctions: p.allFunctions,
    tags: p.tags,
    matchKind: p.matchKind,
    confidence: 1,
    thresholdContext: null,
    thresholdLabel: null,
  } as AnalyseItem
}

function resp(
  counts: { vert: number; jaune: number; orange: number; rouge: number; matched?: number },
  items: AnalyseItem[],
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
    score: 14,
    scoreLabel: 'Bien',
    scoreTone: 'amber',
    items,
    observations: [],
    spectrum: { top5: [], top10: [] },
    synthesis: null,
  } as AnalyseResponse
}

describe('computeEssentiel — tags malformés (objet Wikidata) ne doivent pas crasher', () => {
  it('item JAUNE avec tags = objet -> pas de throw', () => {
    const r = resp({ vert: 2, jaune: 1, orange: 0, rouge: 0 }, [
      item({ position: 1, name: 'Aqua', colorRating: 'Vert', tags: [] }),
      item({ position: 2, name: 'Niacinamide', colorRating: 'Jaune', tags: WIKIDATA_OBJECT_TAGS }),
    ])
    expect(() => computeEssentiel(r)).not.toThrow()
  })

  it('item ORANGE avec tags = objet -> pas de throw', () => {
    const r = resp({ vert: 1, jaune: 0, orange: 1, rouge: 0 }, [
      item({ position: 1, name: 'Phenoxyethanol', colorRating: 'Orange', tags: WIKIDATA_OBJECT_TAGS }),
    ])
    expect(() => computeEssentiel(r)).not.toThrow()
  })

  it('item ROUGE avec tags = objet -> pas de throw', () => {
    const r = resp({ vert: 1, jaune: 0, orange: 0, rouge: 1 }, [
      item({ position: 1, name: 'Mineral Oil', colorRating: 'Rouge', tags: WIKIDATA_OBJECT_TAGS }),
    ])
    expect(() => computeEssentiel(r)).not.toThrow()
  })

  it('item VERT avec tags = objet -> pas de throw (pickPositives)', () => {
    const r = resp({ vert: 1, jaune: 0, orange: 0, rouge: 0 }, [
      item({ position: 1, name: 'Glycerin', colorRating: 'Vert', tags: WIKIDATA_OBJECT_TAGS, primaryFunction: 'Humectant' }),
    ])
    expect(() => computeEssentiel(r)).not.toThrow()
  })

  it('cas réaliste mixte (vert + jaune tags-objet) -> pas de throw + renvoie un résultat', () => {
    const r = resp({ vert: 3, jaune: 1, orange: 0, rouge: 0 }, [
      item({ position: 1, name: 'Aqua', colorRating: 'Vert', tags: ['solvant'] }),
      item({ position: 2, name: 'Niacinamide', colorRating: 'Jaune', tags: WIKIDATA_OBJECT_TAGS }),
      item({ position: 3, name: 'Glycerin', colorRating: 'Vert', tags: WIKIDATA_OBJECT_TAGS }),
    ])
    let out: ReturnType<typeof computeEssentiel> | null = null
    expect(() => { out = computeEssentiel(r) }).not.toThrow()
    expect(out).not.toBeNull()
  })
})
