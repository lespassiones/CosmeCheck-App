/**
 * Tests du moteur DÉTERMINISTE de conflits de routine (`lib/routine/conflicts.ts`).
 *
 * QUOI : une fixture par règle du catalogue (R01..R12) + trace + résolution des
 * créneaux + downgrade + ordre déterministe + stabilité des ids.
 *
 * POURQUOI : ce moteur pilote un badge et des alertes ; toute régression sur une
 * règle ou sur l'ordre casserait l'expérience. On y verrouille aussi le MYTHE
 * vitamine C + niacinamide (jamais émis) et la non-régression de l'export
 * `computeAllergenOverlap` réutilisé depuis l'engine.
 */
import {
  conflictId,
  countBadgeConflicts,
  detectConflicts,
  downgrade,
  type ConflictInput,
  type RoutineConflict,
} from '@/lib/routine/conflicts'
import { computeAllergenOverlap } from '@/lib/routine/engine'
import type { AnalyseItem } from '@/lib/analysis/types'
import type { SkinProfile } from '@/lib/skin/profile'
import type { UserRestrictions } from '@/lib/supabase/types'
import type { IngredientFamily } from '@/lib/restrictions/check'

const NO_PROFILE: SkinProfile = {}
const NO_RESTRICTIONS: UserRestrictions = { families: [], ingredients: [] }
const NO_FAMILIES: IngredientFamily[] = []

function item(p: Partial<AnalyseItem> & { name?: string }): AnalyseItem {
  return {
    position: p.position ?? 1,
    input: p.input ?? p.name ?? p.slug ?? '',
    slug: p.slug ?? null,
    name: p.name ?? p.slug ?? '',
    colorRating: p.colorRating ?? 'Vert',
    tags: p.tags,
    thresholdContext: p.thresholdContext,
  }
}

function product(p: Partial<ConflictInput> & { analysisId: string }): ConflictInput {
  return {
    analysisId: p.analysisId,
    name: p.name ?? p.analysisId,
    timeOfDay: p.timeOfDay ?? 'both',
    frequency: p.frequency ?? 'daily',
    category: p.category ?? null,
    categoryPrecise: p.categoryPrecise ?? null,
    productType: p.productType ?? null,
    items: p.items ?? [],
    euAllergens: p.euAllergens ?? null,
  }
}

function run(
  products: ConflictInput[],
  profile: SkinProfile = NO_PROFILE,
  restrictions: UserRestrictions = NO_RESTRICTIONS,
  families: IngredientFamily[] = NO_FAMILIES,
): RoutineConflict[] {
  return detectConflicts(products, profile, restrictions, families)
}

const of = (list: RoutineConflict[], ruleId: string) => list.filter((c) => c.ruleId === ruleId)

describe('R01 rétinoïde + exfoliant même créneau', () => {
  it('rétinol (soir) + acide glycolique (soir) => 1 conflit high, slot soir, titre avec les 2 noms', () => {
    const conflicts = run([
      product({ analysisId: 'a', timeOfDay: 'evening', items: [item({ slug: 'retinol', name: 'Rétinol X' })] }),
      product({ analysisId: 'b', timeOfDay: 'evening', items: [item({ slug: 'glycolic-acid', name: 'Acide glycolique' })] }),
    ])
    const r01 = of(conflicts, 'retinoid-exfoliant-same-slot')
    expect(r01).toHaveLength(1)
    expect(r01[0].severity).toBe('high')
    expect(r01[0].slot).toBe('evening')
    expect(r01[0].title).toContain('Rétinol X')
    expect(r01[0].title).toContain('Acide glycolique')
  })

  it('rétinol (both) + acide (matin) => slot matin', () => {
    const conflicts = run([
      product({ analysisId: 'a', timeOfDay: 'both', items: [item({ slug: 'retinol', name: 'R' })] }),
      product({ analysisId: 'b', timeOfDay: 'morning', items: [item({ slug: 'glycolic-acid', name: 'G' })] }),
    ])
    expect(of(conflicts, 'retinoid-exfoliant-same-slot')[0].slot).toBe('morning')
  })

  it('rétinol soir + AHA matin => aucun conflit R01 (créneaux disjoints)', () => {
    const conflicts = run([
      product({ analysisId: 'a', timeOfDay: 'evening', items: [item({ slug: 'retinol', name: 'R' })] }),
      product({ analysisId: 'b', timeOfDay: 'morning', items: [item({ slug: 'glycolic-acid', name: 'G' })] }),
    ])
    expect(of(conflicts, 'retinoid-exfoliant-same-slot')).toHaveLength(0)
  })
})

describe('R02 rétinoïde + vitamine C', () => {
  it('vitamine C pure même créneau => medium', () => {
    const conflicts = run([
      product({ analysisId: 'a', timeOfDay: 'evening', items: [item({ slug: 'retinol', name: 'R' })] }),
      product({ analysisId: 'b', timeOfDay: 'evening', items: [item({ slug: 'ascorbic-acid', name: 'Vit C' })] }),
    ])
    const r = of(conflicts, 'retinoid-vitc-same-slot')
    expect(r).toHaveLength(1)
    expect(r[0].severity).toBe('medium')
  })

  it('dérivé de vitamine C => info', () => {
    const conflicts = run([
      product({ analysisId: 'a', timeOfDay: 'evening', items: [item({ slug: 'retinol', name: 'R' })] }),
      product({ analysisId: 'b', timeOfDay: 'evening', items: [item({ slug: 'ascorbyl-glucoside', name: 'Dérivé' })] }),
    ])
    expect(of(conflicts, 'retinoid-vitc-same-slot')[0].severity).toBe('info')
  })
})

describe('R03 rétinoïde le matin', () => {
  it('rétinoïde matin => medium', () => {
    const conflicts = run([
      product({ analysisId: 'a', timeOfDay: 'morning', items: [item({ slug: 'retinol', name: 'R' })] }),
    ])
    expect(of(conflicts, 'retinoid-morning')[0].severity).toBe('medium')
  })

  it('rétinoïde soir uniquement => absent', () => {
    const conflicts = run([
      product({ analysisId: 'a', timeOfDay: 'evening', items: [item({ slug: 'retinol', name: 'R' })] }),
    ])
    expect(of(conflicts, 'retinoid-morning')).toHaveLength(0)
  })
})

describe('R04 exfoliant le matin sans SPF', () => {
  it('BHA matin sans solaire => high', () => {
    const conflicts = run([
      product({ analysisId: 'a', timeOfDay: 'morning', items: [item({ slug: 'salicylic-acid', name: 'BHA' })] }),
    ])
    expect(of(conflicts, 'acids-morning-no-spf')[0].severity).toBe('high')
  })

  it('avec un solaire le matin => absent', () => {
    const conflicts = run([
      product({ analysisId: 'a', timeOfDay: 'morning', items: [item({ slug: 'salicylic-acid', name: 'BHA' })] }),
      product({ analysisId: 'spf', timeOfDay: 'morning', productType: 'Crème solaire SPF50', items: [item({ name: 'Aqua' })] }),
    ])
    expect(of(conflicts, 'acids-morning-no-spf')).toHaveLength(0)
  })
})

describe('R05 rétinoïde sans SPF le matin', () => {
  it('rétinoïde le soir, aucun SPF le matin => info', () => {
    const conflicts = run([
      product({ analysisId: 'a', timeOfDay: 'evening', items: [item({ slug: 'retinol', name: 'R' })] }),
    ])
    expect(of(conflicts, 'retinoid-no-morning-spf')[0].severity).toBe('info')
  })
})

describe('R06 sur-exfoliation', () => {
  const three = [
    product({ analysisId: 'a', items: [item({ slug: 'glycolic-acid', name: 'G' })] }),
    product({ analysisId: 'b', items: [item({ slug: 'salicylic-acid', name: 'S' })] }),
    product({ analysisId: 'c', items: [item({ slug: 'mandelic-acid', name: 'M' })] }),
  ]

  it('3 produits exfoliants => medium', () => {
    expect(of(run(three), 'over-exfoliation')[0].severity).toBe('medium')
  })

  it('profil sensible => high', () => {
    expect(of(run(three, { concerns: ['sensibilite'] }), 'over-exfoliation')[0].severity).toBe('high')
  })

  it('2 produits seulement => absent', () => {
    expect(of(run(three.slice(0, 2)), 'over-exfoliation')).toHaveLength(0)
  })
})

describe('R07 peroxyde de benzoyle + rétinoïde', () => {
  it('même créneau => high', () => {
    const conflicts = run([
      product({ analysisId: 'a', timeOfDay: 'evening', items: [item({ slug: 'benzoyl-peroxide', name: 'BPO' })] }),
      product({ analysisId: 'b', timeOfDay: 'evening', items: [item({ slug: 'retinol', name: 'R' })] }),
    ])
    expect(of(conflicts, 'bpo-retinoid-same-slot')[0].severity).toBe('high')
  })
})

describe('MYTHE vitamine C + niacinamide', () => {
  it("le couple n'émet AUCUN conflit", () => {
    const conflicts = run([
      product({ analysisId: 'a', timeOfDay: 'evening', items: [item({ slug: 'ascorbic-acid', name: 'Vit C' })] }),
      product({ analysisId: 'b', timeOfDay: 'evening', items: [item({ slug: 'niacinamide', name: 'Niacinamide' })] }),
    ])
    expect(conflicts.every((c) => !c.ruleId.includes('niacinamide'))).toBe(true)
    expect(conflicts.every((c) => !/niacinamide/i.test(c.title))).toBe(true)
  })
})

describe('R09 allergène parfumant en double', () => {
  const two = [
    product({ analysisId: 'a', items: [item({ name: 'Linalool' })] }),
    product({ analysisId: 'b', items: [item({ name: 'Linalool' })] }),
  ]

  it('profil neutre => info', () => {
    const r = of(run(two), 'allergen-duplication')
    expect(r).toHaveLength(1)
    expect(r[0].severity).toBe('info')
    expect(r[0].title).toContain('Linalool')
  })

  it('profil rougeurs => medium', () => {
    expect(of(run(two, { concerns: ['rougeurs'] }), 'allergen-duplication')[0].severity).toBe('medium')
  })
})

describe('R10 alcool desséchant', () => {
  const withAlcohol = (position: number) =>
    product({ analysisId: 'a', name: 'Tonique', items: [item({ name: 'Alcohol Denat', tags: ['alcool'], position })] })

  it('tag alcool position 3 + sécheresse => medium', () => {
    expect(of(run([withAlcohol(3)], { concerns: ['secheresse'] }), 'alcohol-dry-skin')[0].severity).toBe('medium')
  })

  it('sans préoccupation ni type de peau à risque => absent', () => {
    expect(of(run([withAlcohol(3)]), 'alcohol-dry-skin')).toHaveLength(0)
  })

  it('alcool en position 15 (trop bas) => absent', () => {
    expect(of(run([withAlcohol(15)], { concerns: ['secheresse'] }), 'alcohol-dry-skin')).toHaveLength(0)
  })
})

describe('R11 huiles essentielles et peau sensible', () => {
  it('huile essentielle + sensibilité => medium', () => {
    const conflicts = run(
      [product({ analysisId: 'a', items: [item({ name: 'Lavandula Oil', tags: ['huile-essentielle'] })] })],
      { concerns: ['sensibilite'] },
    )
    expect(of(conflicts, 'essential-oils-sensitive')[0].severity).toBe('medium')
  })
})

describe('R12 ingrédient restreint', () => {
  it('famille restreinte (match par tag) => high', () => {
    const conflicts = run(
      [product({ analysisId: 'a', name: 'Sérum', items: [item({ name: 'Dimethicone', tags: ['silicone'], position: 2 })] })],
      NO_PROFILE,
      { families: ['silicones'], ingredients: [] },
      [{ slug: 'silicones', tagSlug: 'silicone', name: 'Silicones' }],
    )
    expect(of(conflicts, 'restricted-ingredient')[0].severity).toBe('high')
  })

  it('ingrédient restreint (match par slug) => high', () => {
    const conflicts = run(
      [product({ analysisId: 'a', name: 'Crème', items: [item({ slug: 'phenoxyethanol', name: 'Phenoxyethanol', position: 4 })] })],
      NO_PROFILE,
      { families: [], ingredients: [{ slug: 'phenoxyethanol', name: 'Phénoxyéthanol' }] },
      NO_FAMILIES,
    )
    expect(of(conflicts, 'restricted-ingredient')[0].severity).toBe('high')
  })
})

describe('downgrade trace', () => {
  it('rétinol en trace + AHA dosé => R01 rétrograde high -> medium', () => {
    const conflicts = run([
      product({
        analysisId: 'a',
        timeOfDay: 'evening',
        items: [item({ slug: 'retinol', name: 'R', thresholdContext: 'after_fragrance' })],
      }),
      product({ analysisId: 'b', timeOfDay: 'evening', items: [item({ slug: 'glycolic-acid', name: 'G' })] }),
    ])
    expect(of(conflicts, 'retinoid-exfoliant-same-slot')[0].severity).toBe('medium')
  })
})

describe('ordre déterministe, id stable, badge', () => {
  it('conflictId est stable quel que soit l ordre des produits', () => {
    expect(conflictId('r', ['b', 'a'])).toBe(conflictId('r', ['a', 'b']))
    expect(conflictId('r', ['a', 'b'])).toBe('r:a,b')
  })

  it('downgrade: high -> medium -> info -> info', () => {
    expect(downgrade('high')).toBe('medium')
    expect(downgrade('medium')).toBe('info')
    expect(downgrade('info')).toBe('info')
  })

  it('countBadgeConflicts exclut les info', () => {
    const fake: RoutineConflict[] = [
      { id: '1', ruleId: 'x', severity: 'high', title: '', explanation: '', tip: '', productIds: ['a'], slot: null },
      { id: '2', ruleId: 'y', severity: 'medium', title: '', explanation: '', tip: '', productIds: ['b'], slot: null },
      { id: '3', ruleId: 'z', severity: 'info', title: '', explanation: '', tip: '', productIds: ['c'], slot: null },
    ]
    expect(countBadgeConflicts(fake)).toBe(2)
  })

  it('tri: high avant medium avant info', () => {
    // rétinol+AHA (high) + rétinoïde sans SPF (info) => high en premier.
    const conflicts = run([
      product({ analysisId: 'a', timeOfDay: 'evening', items: [item({ slug: 'retinol', name: 'R' })] }),
      product({ analysisId: 'b', timeOfDay: 'evening', items: [item({ slug: 'glycolic-acid', name: 'G' })] }),
    ])
    const ranks = conflicts.map((c) => c.severity)
    // Les high (le cas échéant) précèdent tout info.
    const firstInfo = ranks.indexOf('info')
    const lastHigh = ranks.lastIndexOf('high')
    if (firstInfo !== -1 && lastHigh !== -1) expect(lastHigh).toBeLessThan(firstInfo)
  })
})

describe('non-régression computeAllergenOverlap (export réutilisé)', () => {
  it('renvoie les allergènes présents dans 2+ produits avec leurs productIds', () => {
    const overlap = computeAllergenOverlap([
      { id: 'a', result: { items: [item({ name: 'Limonene' })] } },
      { id: 'b', result: { items: [item({ name: 'Limonene' })] } },
      { id: 'c', result: { items: [item({ name: 'Aqua' })] } },
    ])
    expect(overlap).toHaveLength(1)
    expect(overlap[0].inciName).toBe('LIMONENE')
    expect(overlap[0].productIds.sort()).toEqual(['a', 'b'])
  })
})
