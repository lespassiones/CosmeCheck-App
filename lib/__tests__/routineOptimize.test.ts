import { computeOptimizeInfo, selectToOptimize } from '@/lib/routine/optimize'
import type { AnalyseResponse } from '@/lib/analysis/types'

function mk(opts: {
  score: number
  orange?: number
  rouge?: number
  items?: Array<{ name: string; colorRating?: string | null; tags?: string[]; is_restricted?: boolean }>
}): AnalyseResponse {
  const items = (opts.items ?? []).map((it, i) => ({
    position: i + 1,
    input: it.name,
    slug: it.name.toLowerCase(),
    name: it.name,
    colorRating: (it.colorRating ?? null) as never,
    tags: it.tags ?? [],
    is_restricted: it.is_restricted ?? false,
  }))
  return {
    counts: { vert: 0, jaune: 0, orange: opts.orange ?? 0, rouge: opts.rouge ?? 0, total: items.length, matched: items.length, unknown: 0 } as never,
    score: opts.score,
    scoreLabel: '',
    scoreTone: 'green',
    items: items as never,
    observations: [],
  } as unknown as AnalyseResponse
}

describe('computeOptimizeInfo', () => {
  it('produit propre (vert, sans pénalisant) → pas à optimiser', () => {
    const r = computeOptimizeInfo(mk({ score: 18, items: [{ name: 'AQUA', colorRating: 'Vert' }] }))
    expect(r.isToOptimize).toBe(false)
    expect(r.dangerLabel).toBeNull()
    expect(r.cappedScore).toBe(18)
  })

  it('rouge → score déjà bas (pastille position-aware), à optimiser + badge rouge', () => {
    // Plus de color cap : notre pastille fait DÉJÀ chuter le score quand un rouge
    // est présent (score ~4). Le badge suit la couleur de tier du produit (< 5 = rouge).
    const r = computeOptimizeInfo(mk({ score: 4, rouge: 1, items: [{ name: 'METHYLISOTHIAZOLINONE', colorRating: 'Rouge', tags: ['conservateur'] }] }))
    expect(r.isToOptimize).toBe(true)
    expect(r.cappedScore).toBe(4) // pas de re-plafonnement
    expect(r.dangerColor).toBe('rouge')
    expect(r.dangerLabel).toBe('Conservateur')
  })

  it('score brut très bas (< 5) → badge rouge « À éviter »', () => {
    const r = computeOptimizeInfo(mk({ score: 3, rouge: 2, items: [{ name: 'X', colorRating: 'Rouge' }] }))
    expect(r.dangerColor).toBe('rouge')
  })

  it('restriction prioritaire sur la couleur pour le badge', () => {
    const r = computeOptimizeInfo(mk({
      score: 14, orange: 1,
      items: [
        { name: 'CITRONELLOL', colorRating: 'Orange' },
        { name: 'PARFUM', colorRating: 'Jaune', tags: ['parfum-synthese'], is_restricted: true },
      ],
    }))
    expect(r.isToOptimize).toBe(true)
    expect(r.dangerLabel).toBe('Parfum de synthèse') // restriction gagne
    expect(r.dangerColor).toBe('rouge') // restriction = rouge
  })

  it('orange seul → badge orange', () => {
    const r = computeOptimizeInfo(mk({ score: 12, orange: 1, items: [{ name: 'DIMETHICONE', colorRating: 'Orange', tags: ['silicone'] }] }))
    expect(r.dangerColor).toBe('orange')
    expect(r.dangerLabel).toBe('Silicone')
  })
})

describe('selectToOptimize', () => {
  const products = [
    { id: 'clean', r: mk({ score: 19, items: [{ name: 'AQUA', colorRating: 'Vert' }] }) },
    { id: 'orange', r: mk({ score: 12, orange: 1, items: [{ name: 'DIMETHICONE', colorRating: 'Orange' }] }) },
    { id: 'rouge', r: mk({ score: 4, rouge: 1, items: [{ name: 'X', colorRating: 'Rouge' }] }) },
    { id: 'restr', r: mk({ score: 15, items: [{ name: 'PARFUM', colorRating: 'Jaune', is_restricted: true }] }) },
  ]

  it('exclut les produits propres + trie par sévérité (restriction puis rouge puis orange)', () => {
    const sel = selectToOptimize(products, (p) => p.r, 5)
    expect(sel.map((s) => (s.product as { id: string }).id)).toEqual(['restr', 'rouge', 'orange'])
  })

  it('respecte le plafond top N', () => {
    const sel = selectToOptimize(products, (p) => p.r, 2)
    expect(sel).toHaveLength(2)
    expect((sel[0].product as { id: string }).id).toBe('restr')
  })
})
