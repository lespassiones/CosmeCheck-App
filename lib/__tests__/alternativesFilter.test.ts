/**
 * alternativesFilter — preuve que les recommandations excluent STRICTEMENT
 * tout produit contenant un élément évité par l'utilisateur (ingrédient banni,
 * famille, ou allergie en texte libre), insensiblement à la casse/aux accents.
 */
import {
  buildExclusionSet,
  filterAlternatives,
  isExclusionEmpty,
  normalizeToken,
  productMatchesExclusion,
  type AlternativeProduct,
} from '@/lib/analysis/alternativesFilter'
import type { UserRestrictions } from '@/lib/supabase/types'

const NO_RESTRICTIONS: UserRestrictions = { families: [], ingredients: [] }

function product(ean: string, inci: string, score = 18): AlternativeProduct {
  return {
    ean,
    brand: 'B',
    name: `P-${ean}`,
    imageUrl: null,
    score,
    scoreLabel: 'Bon',
    scoreTone: 'green',
    countTotal: 10,
    ingredientsText: inci,
  }
}

describe('normalizeToken', () => {
  it('met en minuscule, retire accents et compacte les espaces', () => {
    expect(normalizeToken('  PHÉNOXYÉTHANOL  ')).toBe('phenoxyethanol')
    expect(normalizeToken('Sodium   Laureth   Sulfate')).toBe('sodium laureth sulfate')
  })
})

describe('buildExclusionSet', () => {
  it('fusionne ingrédients explicites + familles (exact) et freeform (substring ≥3)', () => {
    const ex = buildExclusionSet({
      restrictions: {
        families: ['paraben'],
        ingredients: [{ slug: 'aluminum-chlorohydrate', name: 'Aluminum Chlorohydrate' }],
      },
      familyIngredientNames: ['Methylparaben', 'Propylparaben'],
      allergiesFreeform: 'Nickel, ph',
    })
    expect(ex.exactNames.has('aluminum chlorohydrate')).toBe(true)
    expect(ex.exactNames.has('methylparaben')).toBe(true)
    expect(ex.exactNames.has('propylparaben')).toBe(true)
    // "ph" < 3 caractères → ignoré (sinon bannirait quasi tout)
    expect(ex.substrings).toEqual(['nickel'])
  })

  it('sans restriction ni allergie → ensemble vide', () => {
    const ex = buildExclusionSet({
      restrictions: NO_RESTRICTIONS,
      familyIngredientNames: [],
      allergiesFreeform: '',
    })
    expect(isExclusionEmpty(ex)).toBe(true)
  })
})

describe('productMatchesExclusion', () => {
  const ex = buildExclusionSet({
    restrictions: {
      families: [],
      ingredients: [{ slug: 'sodium-laureth-sulfate', name: 'Sodium Laureth Sulfate' }],
    },
    familyIngredientNames: ['Methylparaben'],
    allergiesFreeform: 'limonene',
  })

  it('détecte un ingrédient banni par token exact (casse/accents indifférents)', () => {
    expect(productMatchesExclusion('Aqua, SODIUM LAURETH SULFATE, Glycerin', ex)).toBe(true)
    expect(productMatchesExclusion('Aqua, Méthylparaben, Parfum', ex)).toBe(true)
  })

  it('détecte une allergie freeform par sous-chaîne', () => {
    expect(productMatchesExclusion('Aqua, Parfum (Limonene), Glycerin', ex)).toBe(true)
  })

  it('ne matche PAS un token qui contient seulement partiellement un nom exact', () => {
    // "Sodium Lauryl Sulfate" ≠ "Sodium Laureth Sulfate" → pas d'exclusion
    expect(productMatchesExclusion('Aqua, Sodium Lauryl Sulfate', ex)).toBe(false)
  })

  it('produit propre → non exclu', () => {
    expect(productMatchesExclusion('Aqua, Glycerin, Coco-Glucoside', ex)).toBe(false)
  })
})

describe('filterAlternatives', () => {
  it('retire les produits contenant un élément évité, conserve l ordre (score)', () => {
    const ex = buildExclusionSet({
      restrictions: { families: [], ingredients: [] },
      familyIngredientNames: ['Methylparaben'],
      allergiesFreeform: null,
    })
    const candidates = [
      product('A', 'Aqua, Glycerin', 20),
      product('B', 'Aqua, Methylparaben', 19),
      product('C', 'Aqua, Coco-Betaine', 18),
    ]
    const out = filterAlternatives(candidates, ex)
    expect(out.map((c) => c.ean)).toEqual(['A', 'C'])
  })

  it('sans exclusion → renvoie tous les candidats inchangés', () => {
    const ex = buildExclusionSet({
      restrictions: NO_RESTRICTIONS,
      familyIngredientNames: [],
      allergiesFreeform: '',
    })
    const candidates = [product('A', 'Aqua'), product('B', 'Glycerin')]
    expect(filterAlternatives(candidates, ex)).toBe(candidates)
  })
})
