/**
 * ocrMode2 — tests éphémères pour les fonctions pures du Mode 2 OCR.
 *
 * parseProductIdentification : parse la réponse JSON de GPT-4o (identification
 * produit).
 * parseOBFProduct : parse la réponse Open Beauty Facts pour extraire l'INCI.
 *
 * Ces fonctions sont pures (aucune dépendance Deno / réseau), mais elles vivent
 * dans lib.ts qui importe des modules Deno. On résout ça en :
 *   1. Posant globalThis.Deno avant tout require (évite le crash Deno.env).
 *   2. Mockant les modules qui ont des effets de bord au chargement
 *      (aiClient, supabase-js, analyser/parse).
 */

// ── 1. Stub Deno avant l'import du module ────────────────────────────────────
;(globalThis as Record<string, unknown>).Deno = {
  env: { get: (_k: string) => undefined },
}

// ── 2. Mocks des dépendances Deno/edge non disponibles en node ───────────────
jest.mock('../../supabase/functions/_shared/aiClient', () => ({
  AI_MODEL: 'gpt-4o-mini',
  callWithFallback: jest.fn(),
  getCached: jest.fn().mockResolvedValue(null),
  hasOpenAI: jest.fn().mockReturnValue(false),
  openai: jest.fn(),
  setCached: jest.fn(),
  sha256Hex: jest.fn().mockResolvedValue('aabbccdd'),
}))

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}))

// analyser/parse.ts uses React Native path aliases — stub it
jest.mock('../../supabase/functions/analyser/parse', () => ({
  parseInciList: jest.fn().mockReturnValue([]),
}))

// ── 3. Import des fonctions pures ─────────────────────────────────────────────
import {
  parseProductIdentification,
  parseOBFProduct,
} from '../../supabase/functions/ocr-scan/lib'

// ─────────────────────────────────────────────────────────────────────────────
// parseProductIdentification
// ─────────────────────────────────────────────────────────────────────────────

describe('parseProductIdentification — JSON valide', () => {
  it('extrait brand et name depuis un JSON complet', () => {
    const result = parseProductIdentification('{"brand": "L\'Oréal", "name": "Elvive Extraordinaire"}')
    expect(result).toEqual({ brand: "L'Oréal", name: 'Elvive Extraordinaire' })
  })

  it('trim les espaces superflus', () => {
    const result = parseProductIdentification('{"brand": "  CeraVe  ", "name": "  Foaming Cleanser  "}')
    expect(result).toEqual({ brand: 'CeraVe', name: 'Foaming Cleanser' })
  })

  it('accepte un JSON avec seulement brand (name absent)', () => {
    const result = parseProductIdentification('{"brand": "Garnier"}')
    expect(result).toEqual({ brand: 'Garnier', name: '' })
  })

  it('accepte un JSON avec seulement name (brand absent)', () => {
    const result = parseProductIdentification('{"name": "Hydra+ Crème"}')
    expect(result).toEqual({ brand: '', name: 'Hydra+ Crème' })
  })

  it('accepte des champs supplémentaires dans le JSON', () => {
    const result = parseProductIdentification(
      '{"brand": "The Ordinary", "name": "Niacinamide 10%", "confidence": 0.95}',
    )
    expect(result).toEqual({ brand: 'The Ordinary', name: 'Niacinamide 10%' })
  })
})

describe('parseProductIdentification — JSON invalide ou champs manquants', () => {
  it('retourne null pour un JSON malformé', () => {
    expect(parseProductIdentification('{brand: "X"}')).toBeNull()
  })

  it('retourne null pour une chaîne vide', () => {
    expect(parseProductIdentification('')).toBeNull()
  })

  it('retourne null pour une chaîne non-JSON', () => {
    expect(parseProductIdentification('pas du JSON')).toBeNull()
  })

  it('retourne null si brand et name sont tous les deux absents', () => {
    expect(parseProductIdentification('{"other": "field"}')).toBeNull()
  })

  it('retourne null si brand et name sont tous les deux des chaînes vides après trim', () => {
    expect(parseProductIdentification('{"brand": "  ", "name": "  "}')).toBeNull()
  })

  it('retourne null si brand et name sont null', () => {
    expect(parseProductIdentification('{"brand": null, "name": null}')).toBeNull()
  })

  it('retourne null pour un tableau JSON (pas un objet)', () => {
    expect(parseProductIdentification('["L\'Oréal", "Elvive"]')).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// parseOBFProduct
// ─────────────────────────────────────────────────────────────────────────────

const OBF_VALID_RESPONSE = {
  products: [
    {
      code: '3600523708383',
      ingredients_text:
        'AQUA, GLYCERIN, CETEARYL ALCOHOL, BEHENTRIMONIUM CHLORIDE, AMODIMETHICONE, PHENOXYETHANOL',
    },
  ],
}

describe('parseOBFProduct — réponse OBF valide', () => {
  it('retourne le premier produit avec ingredients_text > 30 chars', () => {
    const result = parseOBFProduct(OBF_VALID_RESPONSE)
    expect(result).not.toBeNull()
    expect(result!.ingredientsText).toBe(
      'AQUA, GLYCERIN, CETEARYL ALCOHOL, BEHENTRIMONIUM CHLORIDE, AMODIMETHICONE, PHENOXYETHANOL',
    )
    expect(result!.ean).toBe('3600523708383')
  })

  it('retourne le premier résultat valide si plusieurs produits', () => {
    const data = {
      products: [
        { code: '001', ingredients_text: 'COURT' }, // trop court
        {
          code: '002',
          ingredients_text: 'AQUA, GLYCERIN, CETEARYL ALCOHOL, BEHENTRIMONIUM CHLORIDE',
        },
      ],
    }
    const result = parseOBFProduct(data)
    expect(result!.ean).toBe('002')
  })

  it('ean est undefined si code absent du produit', () => {
    const data = {
      products: [
        {
          ingredients_text:
            'AQUA, GLYCERIN, CETEARYL ALCOHOL, BEHENTRIMONIUM CHLORIDE, AMODIMETHICONE',
        },
      ],
    }
    const result = parseOBFProduct(data)
    expect(result).not.toBeNull()
    expect(result!.ean).toBeUndefined()
  })

  it('trim le ingredients_text avant de vérifier la longueur', () => {
    const longPadded = '   ' + 'A'.repeat(31) + '   '
    const data = {
      products: [{ code: '999', ingredients_text: longPadded }],
    }
    const result = parseOBFProduct(data)
    expect(result).not.toBeNull()
    expect(result!.ingredientsText).toBe('A'.repeat(31))
  })
})

describe('parseOBFProduct — réponse vide ou invalide', () => {
  it('retourne null si products est un tableau vide', () => {
    expect(parseOBFProduct({ products: [] })).toBeNull()
  })

  it('retourne null si aucun produit n\'a un ingredients_text > 30 chars', () => {
    const data = {
      products: [
        { code: '001', ingredients_text: 'COURT' },
        { code: '002', ingredients_text: 'TROP_BREF' },
      ],
    }
    expect(parseOBFProduct(data)).toBeNull()
  })

  it('retourne null si ingredients_text est exactement 30 chars (limite non incluse)', () => {
    const data = {
      products: [{ code: '001', ingredients_text: 'A'.repeat(30) }],
    }
    expect(parseOBFProduct(data)).toBeNull()
  })

  it('retourne null si products est absent', () => {
    expect(parseOBFProduct({ count: 0 })).toBeNull()
  })

  it('retourne null pour null', () => {
    expect(parseOBFProduct(null)).toBeNull()
  })

  it('retourne null pour undefined', () => {
    expect(parseOBFProduct(undefined)).toBeNull()
  })

  it('retourne null pour une chaîne', () => {
    expect(parseOBFProduct('{"products":[]}')).toBeNull()
  })

  it('ignore les entrées avec ingredients_text non-string', () => {
    const data = {
      products: [
        { code: '001', ingredients_text: 12345 },
        { code: '002', ingredients_text: null },
      ],
    }
    expect(parseOBFProduct(data)).toBeNull()
  })
})
