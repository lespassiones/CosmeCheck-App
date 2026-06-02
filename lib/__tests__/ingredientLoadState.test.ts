/**
 * Dérivation d'état pour IngredientDetailScreen — test pur.
 */
import {
  deriveIngredientLoadState,
  INGREDIENT_STALE_MS,
  PRODUCTS_STALE_MS,
} from '@/components/ingredient/loadState'
import type { IngredientDetail, IngredientProductHit } from '@/components/ingredient/types'

function fakeIng(): IngredientDetail {
  return {
    id: 1,
    inci_id: 1,
    slug: 'aqua',
    name: 'aqua',
    cas_number: null,
    einecs_number: null,
    classification: null,
    color_rating: 'Vert',
    origin: null,
    description: null,
    functions: null,
    prevalence_pct: null,
    category_breakdown: null,
    regulated_zones: null,
    translations: null,
    source_url: '',
    details_scraped: false,
  }
}

const PRODUCT: IngredientProductHit = {
  product_id: 1,
  brand: 'Brand',
  name: 'Cream',
  volume: null,
  score: null,
  image_url: null,
  source_url: null,
  ingredient_position: null,
}

describe('deriveIngredientLoadState', () => {
  it('slug vide → notfound (avant tout fetch)', () => {
    expect(deriveIngredientLoadState(undefined, false, null, undefined)).toEqual({
      status: 'notfound',
    })
    expect(deriveIngredientLoadState('', false, null, undefined)).toEqual({
      status: 'notfound',
    })
  })

  it('slug défini + ingLoading=true → loading', () => {
    expect(deriveIngredientLoadState('aqua', true, null, undefined)).toEqual({
      status: 'loading',
    })
  })

  it('slug défini + chargé mais ing null → notfound', () => {
    expect(deriveIngredientLoadState('xyz', false, null, undefined)).toEqual({
      status: 'notfound',
    })
  })

  it('slug + ing valide + produits indéfinis → ready avec products=[]', () => {
    const ing = fakeIng()
    const result = deriveIngredientLoadState('aqua', false, ing, undefined)
    expect(result.status).toBe('ready')
    if (result.status === 'ready') {
      expect(result.ing).toBe(ing)
      expect(result.products).toEqual([])
    }
  })

  it('slug + ing valide + liste produits → ready avec ces produits', () => {
    const ing = fakeIng()
    const products: IngredientProductHit[] = [PRODUCT]
    const result = deriveIngredientLoadState('aqua', false, ing, products)
    if (result.status === 'ready') {
      expect(result.products).toEqual(products)
    } else {
      throw new Error('expected ready')
    }
  })

  it('priorité loading sur ing déjà arrivé (refetch en cours)', () => {
    // En cas de refetch, on garde la donnée mais isLoading peut être true au
    // premier mount. Cette implémentation considère ingLoading comme prioritaire.
    expect(
      deriveIngredientLoadState('aqua', true, fakeIng(), undefined).status,
    ).toBe('loading')
  })
})

describe('TTL constants', () => {
  it('ingredient : 24h', () => {
    expect(INGREDIENT_STALE_MS).toBe(24 * 60 * 60 * 1000)
  })

  it('products : 1h', () => {
    expect(PRODUCTS_STALE_MS).toBe(60 * 60 * 1000)
  })
})
