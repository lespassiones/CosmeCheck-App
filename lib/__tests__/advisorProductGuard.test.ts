/**
 * Garde-fous produits de `advisor-agent` : restrictions relues sur le texte
 * INCI, dédoublonnage par marque + nom, entités HTML des noms importés.
 */
import {
  decodeEntities,
  productNameKey,
  restrictionViolation,
} from '../../supabase/functions/advisor-agent/productGuard'

// Composition réelle du baume proposé à tort à un profil « sans parfum ».
const BAUME = 'AQUA/WATER/EAU, BUTYROSPERMUM PARKII (SHEA) BUTTER, TRIETHYL CITRATE, GLYCERIN, CETEARYL ALCOHOL, PARFUM, LIMONENE'

describe('restrictionViolation — familles', () => {
  it('parfum (slug de famille ou mot-clé du modèle)', () => {
    expect(restrictionViolation(BAUME, ['parfum-synthese'])).toBe('parfum-synthese')
    expect(restrictionViolation(BAUME, ['parfum'])).toBe('parfum')
    expect(restrictionViolation('AQUA, FRAGRANCE', ['parfum'])).toBe('parfum')
  })

  it('allergènes parfumants', () => {
    expect(restrictionViolation(BAUME, ['allergene-parfumant'])).toBe('allergene-parfumant')
    expect(restrictionViolation('AQUA, GLYCERIN', ['allergene'])).toBeNull()
  })

  it("alcool : l'éthanol oui, les alcools gras non", () => {
    expect(restrictionViolation('AQUA, ALCOHOL DENAT., GLYCERIN', ['alcool'])).toBe('alcool')
    expect(restrictionViolation('AQUA, ALCOHOL, GLYCERIN', ['alcool'])).toBe('alcool')
    expect(restrictionViolation(BAUME, ['alcool'])).toBeNull()
    expect(restrictionViolation('AQUA, BENZYL ALCOHOL', ['alcool'])).toBeNull()
  })

  it('sulfates tensioactifs, silicones, sels d’aluminium, rétinoïdes', () => {
    expect(restrictionViolation('AQUA, SODIUM LAURETH SULFATE', ['sulfate'])).toBe('sulfate')
    expect(restrictionViolation('AQUA, MAGNESIUM SULFATE', ['sulfate'])).toBeNull()
    expect(restrictionViolation('AQUA, DIMETHICONE', ['silicone'])).toBe('silicone')
    expect(restrictionViolation('AQUA, ALUMINUM CHLOROHYDRATE', ['sel_aluminium'])).toBe('sel_aluminium')
    expect(restrictionViolation('POTASSIUM ALUM', ['sel-aluminium'])).toBe('sel-aluminium')
    expect(restrictionViolation('AQUA, RETINOL', ['retinoides'])).toBe('retinoides')
  })

  it('huiles essentielles, pas les huiles végétales', () => {
    expect(restrictionViolation('AQUA, LAVANDULA ANGUSTIFOLIA OIL', ['huile_essentielle'])).toBe('huile_essentielle')
    expect(restrictionViolation('AQUA, CITRUS AURANTIUM DULCIS PEEL OIL', ['huile-essentielle'])).toBe('huile-essentielle')
    expect(restrictionViolation('HELIANTHUS ANNUUS SEED OIL, PRUNUS AMYGDALUS DULCIS OIL', ['huile-essentielle'])).toBeNull()
  })

  it('familles trop larges ignorées, composition vide = pas de rejet', () => {
    expect(restrictionViolation(BAUME, ['conservateur'])).toBeNull()
    expect(restrictionViolation('', ['parfum'])).toBeNull()
    expect(restrictionViolation(null, ['parfum'])).toBeNull()
  })
})

describe('restrictionViolation — ingrédient précis', () => {
  it('nom INCI, mot à mot et sans casse', () => {
    expect(restrictionViolation('AQUA, SODIUM LAURYL SULFATE', ['SODIUM LAURYL SULFATE'])).toBe('SODIUM LAURYL SULFATE')
    expect(restrictionViolation('AQUA, DIMETHICONOL', ['dimethiconol'])).toBe('dimethiconol')
    // « DIMETHICONE » ne doit pas matcher « DIMETHICONOL ».
    expect(restrictionViolation('AQUA, DIMETHICONOL', ['DIMETHICONE'])).toBeNull()
  })
})

describe('productNameKey / decodeEntities', () => {
  it('même marque + nom = même clé (casse, accents, ponctuation)', () => {
    expect(productNameKey('facetheory', 'Porebright Sérum Affinant Niacinamide 20 %')).toBe(
      productNameKey('Facetheory', 'porebright serum affinant niacinamide 20%'),
    )
    expect(productNameKey('A', 'Crème')).not.toBe(productNameKey('B', 'Crème'))
  })

  it('décode les entités HTML', () => {
    expect(decodeEntities('L&#x27;Oreal Paris')).toBe("L'Oreal Paris")
    expect(decodeEntities('Soins &amp; Co')).toBe('Soins & Co')
    expect(decodeEntities(null)).toBeNull()
  })
})
