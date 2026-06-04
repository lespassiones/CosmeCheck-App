/**
 * eanLookup — tests de la logique pure parseOBFSearchResult.
 *
 * On teste uniquement la fonction pure exportée (pas l'appel réseau),
 * ce qui permet de rester dans l'env node sans mock fetch.
 */
import { parseOBFSearchResult } from '../../supabase/functions/_shared/eanLookup'

describe('parseOBFSearchResult — entrées invalides / manquantes', () => {
  it('retourne null pour undefined', () => {
    expect(parseOBFSearchResult(undefined)).toBeNull()
  })

  it('retourne null pour null', () => {
    expect(parseOBFSearchResult(null)).toBeNull()
  })

  it('retourne null pour un objet vide', () => {
    expect(parseOBFSearchResult({})).toBeNull()
  })

  it('retourne null pour une liste products vide', () => {
    expect(parseOBFSearchResult({ products: [] })).toBeNull()
  })

  it('retourne null pour un type primitif (string)', () => {
    expect(parseOBFSearchResult('not an object')).toBeNull()
  })

  it('retourne null pour un type primitif (number)', () => {
    expect(parseOBFSearchResult(42)).toBeNull()
  })
})

describe('parseOBFSearchResult — réponse OBF valide', () => {
  it('retourne { ean, ingredientsText } pour un produit valide', () => {
    const mockData = {
      products: [
        {
          code: '3600520441237',
          ingredients_text: 'Aqua, Glycerin, Parfum, Sodium Laureth Sulfate',
        },
      ],
    }
    const result = parseOBFSearchResult(mockData)
    expect(result).not.toBeNull()
    expect(result!.ean).toBe('3600520441237')
    expect(result!.ingredientsText).toBe('Aqua, Glycerin, Parfum, Sodium Laureth Sulfate')
  })

  it('préfère ingredients_text_fr si disponible', () => {
    const mockData = {
      products: [
        {
          code: '3600520441237',
          ingredients_text: 'Aqua, Glycerin, Parfum, something long enough here yes',
          ingredients_text_fr: 'Aqua, Glycérine, Parfum, version française longue ici',
        },
      ],
    }
    const result = parseOBFSearchResult(mockData)
    expect(result).not.toBeNull()
    expect(result!.ingredientsText).toBe(
      'Aqua, Glycérine, Parfum, version française longue ici',
    )
  })

  it('utilise ingredients_text_en si les autres champs sont absents', () => {
    const mockData = {
      products: [
        {
          code: '0012345678901',
          ingredients_text_en: 'Water, Glycerin, Fragrance, more ingredients here yes',
        },
      ],
    }
    const result = parseOBFSearchResult(mockData)
    expect(result).not.toBeNull()
    expect(result!.ean).toBe('0012345678901')
    expect(result!.ingredientsText).toBe(
      'Water, Glycerin, Fragrance, more ingredients here yes',
    )
  })

  it('retourne le premier produit valide quand plusieurs sont présents', () => {
    const mockData = {
      products: [
        { code: '1111111111111', ingredients_text: 'Aqua, Glycerin, Parfum long enough text' },
        { code: '2222222222222', ingredients_text: 'Other, Ingredients, List long enough text' },
      ],
    }
    const result = parseOBFSearchResult(mockData)
    expect(result!.ean).toBe('1111111111111')
  })
})

describe('parseOBFSearchResult — ingredients_text trop court (< 30 chars)', () => {
  it('retourne null si ingredients_text est trop court', () => {
    const mockData = {
      products: [
        {
          code: '3600520441237',
          ingredients_text: 'Aqua, Glycerin',
        },
      ],
    }
    expect(parseOBFSearchResult(mockData)).toBeNull()
  })

  it('retourne null si toutes les variantes de texte sont trop courtes', () => {
    const mockData = {
      products: [
        {
          code: '3600520441237',
          ingredients_text: 'Aqua',
          ingredients_text_fr: 'Eau',
          ingredients_text_en: 'Water',
        },
      ],
    }
    expect(parseOBFSearchResult(mockData)).toBeNull()
  })

  it('saute un produit avec texte trop court et prend le suivant si valide', () => {
    const mockData = {
      products: [
        { code: '0000000000001', ingredients_text: 'Short' },
        {
          code: '0000000000002',
          ingredients_text: 'Aqua, Glycerin, Parfum long enough to pass threshold',
        },
      ],
    }
    const result = parseOBFSearchResult(mockData)
    expect(result).not.toBeNull()
    expect(result!.ean).toBe('0000000000002')
  })
})

describe('parseOBFSearchResult — code vide ou absent', () => {
  it('retourne null si code est une chaîne vide', () => {
    const mockData = {
      products: [
        { code: '', ingredients_text: 'Aqua, Glycerin, Parfum long enough text' },
      ],
    }
    expect(parseOBFSearchResult(mockData)).toBeNull()
  })

  it('retourne null si code est absent', () => {
    const mockData = {
      products: [
        { ingredients_text: 'Aqua, Glycerin, Parfum long enough text here yes' },
      ],
    }
    expect(parseOBFSearchResult(mockData)).toBeNull()
  })
})
