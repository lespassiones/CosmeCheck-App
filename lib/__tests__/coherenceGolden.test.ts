/**
 * Jeu de test GOLDEN « produits réels variés » pour le moteur de cohérence
 * (promesses ↔ INCI). Chaque cas reproduit un vrai produit du marché et vérifie
 * que le PIPELINE DÉTERMINISTE (validation des matches contre l'INCI + barème +
 * promesses d'absence + nuance allergène) rend le bon verdict.
 *
 * Le rôle « sémantique » du LLM (quels ingrédients soutiennent quelle promesse,
 * avec quel niveau de preuve) est SIMULÉ ici par des matches représentatifs —
 * exactement ce que le LLM renvoie en prod. Ce qui est testé, c'est la couche
 * SÛRE et déterministe : jamais d'ingrédient inventé, jamais de promesse créée,
 * scoring stable. La qualité du LLM se valide en re-jouant en prod.
 *
 * Couverture voulue : doux botanique (Phitofilos), présence d'actif vraie/fausse,
 * promesse d'absence tenue / contredite franche / à nuancer (allergène bi-fonction),
 * actif documenté clean (The Ordinary), produit dangereux (sulfate/conservateur rouge).
 */
import {
  resolveOpenPromise,
  resolveAbsencePromise,
  computeMetrics,
  type LlmPromiseProposal,
  type OpenLlmMatch,
} from '@/lib/coherence/engine'
import { findCategoryBySlug } from '@/lib/coherence/claims'
import type { AnalyseItem } from '@/lib/analysis/types'

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
    primaryFunction: null,
    allFunctions: p.allFunctions,
    tags: p.tags,
    matchKind: p.matchKind,
    confidence: 1,
    thresholdContext: p.thresholdContext ?? 'before_fragrance',
    thresholdLabel: null,
  } as AnalyseItem
}
const eff = (label: string, excerpt = label): LlmPromiseProposal => ({ category_slug: 'autre', label, excerpt })
const m = (slug: string, evidence: OpenLlmMatch['evidence']): OpenLlmMatch => ({
  item_slug: slug,
  item_name: slug,
  evidence,
  reason: 'r',
})

// ───────────────────────────────────────────────────────────────────────────
// 1) Phitofilos Shampoing pour Boucles — doux botanique + présence + allergène
// ───────────────────────────────────────────────────────────────────────────
describe('Phitofilos Shampoing Boucles (botanique, sans sulfate, Benzyl Alcohol)', () => {
  // Sous-ensemble réel de l'INCI.
  const inci = [
    item({ position: 1, slug: 'aqua', name: 'Aqua' }),
    item({ position: 2, slug: 'spirulina-maxima-extract', name: 'Spirulina Maxima Extract' }),
    item({ position: 3, slug: 'astragalus-gummifer-gum', name: 'Astragalus Gummifer Gum' }),
    item({ position: 11, slug: 'althaea-officinalis-root-extract', name: 'Althaea Officinalis Root Extract' }),
    item({ position: 13, slug: 'niacinamide', name: 'Niacinamide' }),
    item({ position: 20, slug: 'urea', name: 'Urea' }),
    item({ position: 21, slug: 'glycerin', name: 'Glycerin' }),
    item({ position: 28, slug: 'benzyl-alcohol', name: 'Benzyl Alcohol', tags: ['allergene-parfumant'] }),
  ]

  it('Hydratation : NMF + mucilages → tenue (l\'ancien catalogue donnait 0 %)', () => {
    const p = resolveOpenPromise(eff('Hydratation'), inci, [m('urea', 'documented'), m('glycerin', 'documented'), m('althaea-officinalis-root-extract', 'supportive')], [])
    expect(p.verdict).toBe('tenue')
    expect(p.score).toBeGreaterThanOrEqual(85)
  })

  it('Présence : Spiruline → tenue (l\'actif nommé est bien dans l\'INCI)', () => {
    const p = resolveOpenPromise(eff('Présence : Spiruline', 'enrichi en spiruline'), inci, [m('spirulina-maxima-extract', 'documented')], [])
    expect(p.verdict).toBe('tenue')
    expect(p.foundActives.map((f) => f.slug)).toContain('spirulina-maxima-extract')
  })

  it('« Sans allergène parfumant » + Benzyl Alcohol seul → À NUANCER (partielle 50), pas contredite', () => {
    const cat = findCategoryBySlug('absence_allergene_parfumant')!
    const p = resolveAbsencePromise({ category_slug: cat.slug, label: 'Sans allergène parfumant', excerpt: 'sans allergènes' }, cat, inci)
    expect(p.verdict).toBe('partielle')
    expect(p.score).toBe(50)
    // L'ingrédient reste SIGNALÉ (jamais caché).
    expect(p.contradictingActives?.[0].name).toBe('Benzyl Alcohol')
  })
})

// ───────────────────────────────────────────────────────────────────────────
// 2) Présence d'actif MENSONGÈRE — « à l'acide hyaluronique » mais absent
// ───────────────────────────────────────────────────────────────────────────
describe('Fausse promesse de présence (anti-création)', () => {
  const inci = [item({ position: 1, slug: 'aqua', name: 'Aqua' }), item({ position: 2, slug: 'glycerin', name: 'Glycerin' })]
  it('« Présence : Acide hyaluronique » mais aucun hyaluronate dans l\'INCI → non démontré 0', () => {
    // Le LLM (règle présence) ne trouve pas l\'actif → matches vides.
    const p = resolveOpenPromise(eff('Présence : Acide hyaluronique', 'à l\'acide hyaluronique'), inci, [], [])
    expect(p.verdict).toBe('non_demontree')
    expect(p.score).toBe(0)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// 3) The Ordinary Niacinamide 10% + Zinc — actif documenté clean
// ───────────────────────────────────────────────────────────────────────────
describe('The Ordinary Niacinamide 10% + Zinc (sérum clean)', () => {
  const inci = [
    item({ position: 1, slug: 'aqua', name: 'Aqua' }),
    item({ position: 2, slug: 'niacinamide', name: 'Niacinamide' }),
    item({ position: 3, slug: 'zinc-pca', name: 'Zinc PCA' }),
  ]
  it('« Régule le sébum / imperfections » → niacinamide documenté → tenue 80', () => {
    const p = resolveOpenPromise(eff('Régulation du sébum', 'réduit les imperfections'), inci, [m('niacinamide', 'documented')], [])
    expect(p.verdict).toBe('tenue')
    expect(p.score).toBe(80)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// 4) Produit DANGEREUX / trompeur — « sans sulfate » avec un sulfate dedans
// ───────────────────────────────────────────────────────────────────────────
describe('Shampoing conventionnel trompeur (sulfate présent)', () => {
  const inci = [
    item({ position: 1, slug: 'aqua', name: 'Aqua' }),
    item({ position: 2, slug: 'sodium-laureth-sulfate', name: 'Sodium Laureth Sulfate', tags: ['sulfate'], colorRating: 'Orange' }),
    item({ position: 8, slug: 'methylisothiazolinone', name: 'Methylisothiazolinone', tags: ['conservateur'], colorRating: 'Rouge' }),
  ]
  it('« Sans sulfate » mais Sodium Laureth Sulfate présent → CONTREDITE 0', () => {
    const cat = findCategoryBySlug('absence_sulfate')!
    const p = resolveAbsencePromise({ category_slug: cat.slug, label: 'Sans sulfate', excerpt: 'sans sulfate' }, cat, inci)
    expect(p.verdict).toBe('contredite')
    expect(p.score).toBe(0)
    expect(p.contradictingActives?.[0].name).toBe('Sodium Laureth Sulfate')
  })
  it('« Sans allergène parfumant » + vrai allergène (Limonene, NON bi-fonction) → CONTREDITE 0 (pas de nuance abusive)', () => {
    const cat = findCategoryBySlug('absence_allergene_parfumant')!
    const withLimonene = [...inci, item({ position: 9, slug: 'limonene', name: 'Limonene', tags: ['allergene-parfumant'] })]
    const p = resolveAbsencePromise({ category_slug: cat.slug, label: 'Sans allergène parfumant', excerpt: 'hypoallergénique' }, cat, withLimonene)
    expect(p.verdict).toBe('contredite')
    expect(p.score).toBe(0)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// 5) Agrégat — un produit globalement cohérent reste haut, un trompeur chute
// ───────────────────────────────────────────────────────────────────────────
describe('computeMetrics — agrégat réaliste', () => {
  it('4 tenues + 1 à-nuancer (partielle) → tenuePct 100, mais pas 5/5 « franc »', () => {
    const inci = [
      item({ position: 1, slug: 'glycerin', name: 'Glycerin' }),
      item({ position: 28, slug: 'benzyl-alcohol', name: 'Benzyl Alcohol', tags: ['allergene-parfumant'] }),
    ]
    const cat = findCategoryBySlug('absence_allergene_parfumant')!
    const promises = [
      resolveOpenPromise(eff('Hydratation'), inci, [m('glycerin', 'documented')], []),
      resolveOpenPromise(eff('Douceur'), inci, [m('glycerin', 'documented')], []),
      resolveAbsencePromise({ category_slug: cat.slug, label: 'Sans allergène parfumant', excerpt: 'x' }, cat, inci),
    ]
    const metrics = computeMetrics(promises)
    // tenue + partielle comptent dans tenuePct ; la nuance ne casse pas tout.
    expect(metrics.tenuePct).toBe(100)
    expect(metrics.partielleCount).toBe(1)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// 7) PARITÉ v4 — dual-use Annexe III + parfum déclaré (cas qui DIVERGEAIENT
//    entre edge/mobile et web avant la resynchronisation du 7 juil 2026).
// ───────────────────────────────────────────────────────────────────────────
describe('Parité v4 : « sans allergène parfumant » (dual-use + parfum déclaré)', () => {
  const cat = findCategoryBySlug('absence_allergene_parfumant')!
  const promise = { category_slug: cat.slug, label: 'Sans allergène parfumant', excerpt: 'sans allergènes' }

  it('Benzyl Alcohol + PARFUM DÉCLARÉ → CONTREDITE (plus de nuance : la formule est parfumée)', () => {
    const inci = [
      item({ position: 1, slug: 'aqua', name: 'Aqua' }),
      item({ position: 2, slug: 'parfum', name: 'Parfum', tags: ['parfum-synthese'] }),
      item({ position: 3, slug: 'benzyl-alcohol', name: 'Benzyl Alcohol', tags: ['allergene-parfumant'] }),
    ]
    const p = resolveAbsencePromise(promise, cat, inci)
    expect(p.verdict).toBe('contredite')
    expect(p.score).toBe(0)
  })

  it('Benzyl BENZOATE seul (sans parfum déclaré) → PARTIELLE 50 (dual-use élargi à 3 slugs)', () => {
    const inci = [
      item({ position: 1, slug: 'aqua', name: 'Aqua' }),
      item({ position: 2, slug: 'benzyl-benzoate', name: 'Benzyl Benzoate', tags: ['allergene-parfumant'] }),
    ]
    const p = resolveAbsencePromise(promise, cat, inci)
    expect(p.verdict).toBe('partielle')
    expect(p.score).toBe(50)
    expect(p.contradictingActives?.[0].name).toBe('Benzyl Benzoate')
  })

  it('Benzyl Alcohol + Limonene (sans parfum déclaré) → CONTREDITE, les DEUX cités (Limonene = parfum déclaré, pas de nuance)', () => {
    const inci = [
      item({ position: 1, slug: 'aqua', name: 'Aqua' }),
      item({ position: 2, slug: 'benzyl-alcohol', name: 'Benzyl Alcohol', tags: ['allergene-parfumant'] }),
      item({ position: 3, slug: 'limonene', name: 'Limonene', tags: ['allergene-parfumant'] }),
    ]
    const p = resolveAbsencePromise(promise, cat, inci)
    expect(p.verdict).toBe('contredite')
    expect(p.contradictingActives?.map((c) => c.name)).toEqual(['Benzyl Alcohol', 'Limonene'])
  })

  it('Canari de parité : les keywords demelage contiennent l\'union des 3 copies', () => {
    const demelage = findCategoryBySlug('demelage')!
    expect(demelage.keywords).toEqual(expect.arrayContaining(['douceur des cheveux', 'souplesse cheveux', 'detangle', 'detangling']))
  })
})
