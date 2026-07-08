/**
 * Dictionnaire d'actifs (lib/inci/activesDictionary.ts) : socle de la détection
 * déterministe des conflits de routine et de la réorganisation matin/soir.
 *
 * POURQUOI ces tests : les slugs ont été vérifiés en DB (cosme_check.ingredients)
 * le 7 juillet 2026 ; ces tests verrouillent le contrat (classification par slug
 * ET par tag, exclusions assumées bakuchiol/citric-acid, détection solaire) pour
 * que toute régression du dictionnaire casse la suite avant la prod.
 */

import {
  ACTIVE_CLASSES,
  ACTIVE_CLASS_LABEL,
  classifyItem,
  isExfoliatingClass,
  isSunscreenProduct,
} from '@/lib/inci/activesDictionary'

describe('classifyItem', () => {
  it('classe le rétinol par slug', () => {
    expect(classifyItem('retinol', [])).toEqual(['retinoid'])
    expect(classifyItem('retinal', [])).toEqual(['retinoid'])
    expect(classifyItem('hydroxypinacolone-retinoate', [])).toEqual(['retinoid'])
  })

  it('classe par tag seul quand le slug est inconnu (filet retinoides)', () => {
    expect(classifyItem(null, ['retinoides'])).toEqual(['retinoid'])
    expect(classifyItem('un-slug-inconnu', ['acide-salicylique'])).toEqual(['bha'])
  })

  it('ne duplique pas quand slug ET tag matchent la même classe', () => {
    expect(classifyItem('salicylic-acid', ['acide-salicylique'])).toEqual(['bha'])
  })

  it('classe les AHA, PHA et dérivés de vitamine C par slug', () => {
    expect(classifyItem('glycolic-acid', [])).toEqual(['aha'])
    expect(classifyItem('mandelic-acid', [])).toEqual(['aha'])
    expect(classifyItem('gluconolactone', [])).toEqual(['pha'])
    expect(classifyItem('lactobionic-acid', [])).toEqual(['pha'])
    expect(classifyItem('ascorbic-acid', [])).toEqual(['vitc_pure'])
    expect(classifyItem('ascorbyl-glucoside', [])).toEqual(['vitc_derivative'])
    expect(classifyItem('3-o-ethyl-ascorbic-acid', [])).toEqual(['vitc_derivative'])
    expect(classifyItem('niacinamide', [])).toEqual(['niacinamide'])
    expect(classifyItem('benzoyl-peroxide', [])).toEqual(['benzoyl_peroxide'])
  })

  it('exclusions assumées : bakuchiol et citric-acid ne sont dans aucune classe', () => {
    expect(classifyItem('bakuchiol', [])).toEqual([])
    expect(classifyItem('citric-acid', [])).toEqual([])
    expect(classifyItem('azelaic-acid', [])).toEqual([])
  })

  it('tolère slug null / tags null ou malformés', () => {
    expect(classifyItem(null, null)).toEqual([])
    expect(classifyItem(undefined, undefined)).toEqual([])
  })

  it('sortie triée dans l’ordre canonique quel que soit l’ordre des signaux', () => {
    // Slug BHA + tag rétinoïde : retinoid doit sortir avant bha.
    expect(classifyItem('salicylic-acid', ['retinoides'])).toEqual(['retinoid', 'bha'])
  })
})

describe('isExfoliatingClass', () => {
  it('aha, bha, pha sont exfoliants, le reste non', () => {
    expect(isExfoliatingClass('aha')).toBe(true)
    expect(isExfoliatingClass('bha')).toBe(true)
    expect(isExfoliatingClass('pha')).toBe(true)
    expect(isExfoliatingClass('retinoid')).toBe(false)
    expect(isExfoliatingClass('vitc_pure')).toBe(false)
  })
})

describe('isSunscreenProduct', () => {
  const noTags = { itemTags: [] as { tags: string[]; position: number }[] }

  it('détecte via la catégorie solaire', () => {
    expect(
      isSunscreenProduct({ category: 'solaire', categoryPrecise: null, productType: null, ...noTags }),
    ).toBe(true)
    expect(
      isSunscreenProduct({
        category: null,
        categoryPrecise: 'produit-solaire/creme-solaire',
        productType: null,
        ...noTags,
      }),
    ).toBe(true)
  })

  it('détecte via le productType (SPF, sunscreen, écran avec accent)', () => {
    expect(
      isSunscreenProduct({ category: null, categoryPrecise: null, productType: 'Sunscreen SPF50', ...noTags }),
    ).toBe(true)
    expect(
      isSunscreenProduct({ category: null, categoryPrecise: null, productType: 'Écran solaire', ...noTags }),
    ).toBe(true)
  })

  it('détecte via un tag filtre-uv dans le top 10 des positions INCI', () => {
    expect(
      isSunscreenProduct({
        category: 'creme_visage',
        categoryPrecise: null,
        productType: null,
        itemTags: [{ tags: ['filtre-uv'], position: 4 }],
      }),
    ).toBe(true)
    expect(
      isSunscreenProduct({
        category: 'creme_visage',
        categoryPrecise: null,
        productType: null,
        itemTags: [{ tags: ['filtre-uv-mineral'], position: 2 }],
      }),
    ).toBe(true)
  })

  it('ne détecte PAS un filtre UV en position tardive (trace, maquillage)', () => {
    expect(
      isSunscreenProduct({
        category: 'maquillage',
        categoryPrecise: null,
        productType: null,
        itemTags: [{ tags: ['filtre-uv'], position: 15 }],
      }),
    ).toBe(false)
  })

  it('négatif : crème visage sans aucun signal', () => {
    expect(
      isSunscreenProduct({ category: 'creme_visage', categoryPrecise: null, productType: 'Crème hydratante', ...noTags }),
    ).toBe(false)
  })
})

describe('cohérence du dictionnaire', () => {
  it('chaque classe a un libellé FR sans tiret cadratin', () => {
    for (const cls of ACTIVE_CLASSES) {
      const label = ACTIVE_CLASS_LABEL[cls]
      expect(label.length).toBeGreaterThan(2)
      expect(label.includes(String.fromCharCode(0x2014))).toBe(false)
    }
  })
})
