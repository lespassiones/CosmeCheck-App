/**
 * productTypeCategory — preuve que la résolution de catégorie des ALTERNATIVES
 * ne pivote JAMAIS sur un bucket poubelle et retombe proprement sur des signaux
 * fonctionnels (product_type, nom), ou s'ABSTIENT.
 *
 * Bug source (bêta juil 2026) : « Gel de Limpeza Facial CeraVe » (catégorie
 * catalogue = « gel », product_type = null) affichait comme alternatives un savon
 * pour les mains, un gel gingival bébé, un gel jambes, des lingettes.
 */
import {
  detectMisfileLeaf,
  isSpecificCategorySlug,
  normalizeType,
  productNameToCategoryPrefix,
  productTypeToCategoryPrefix,
  refineLeaf,
  resolveAlternativesQuery,
} from '@/lib/catalog/productTypeCategory'

describe('isSpecificCategorySlug', () => {
  it('accepte un slug hiérarchique ≥ 2 niveaux', () => {
    expect(isSpecificCategorySlug('soin-du-corps-et-visage/nettoyant-visage')).toBe(true)
    expect(
      isSpecificCategorySlug('soin-du-corps-et-visage/nettoyant-visage/gel-nettoyant-visage'),
    ).toBe(true)
    expect(isSpecificCategorySlug('coiffure/shampooing')).toBe(true)
  })

  it('REJETTE les buckets poubelle observés en prod', () => {
    // Mono-token (le cœur du bug)
    expect(isSpecificCategorySlug('gel')).toBe(false)
    expect(isSpecificCategorySlug('coiffure')).toBe(false)
    expect(isSpecificCategorySlug('maquillage')).toBe(false)
    expect(isSpecificCategorySlug('sunscreen')).toBe(false)
    expect(isSpecificCategorySlug('hair-gel')).toBe(false)
    // Top-level seul (trop large)
    expect(isSpecificCategorySlug('soin-du-corps-et-visage')).toBe(false)
    // Labels bruts avec espaces
    expect(isSpecificCategorySlug('Crème solaire adulte')).toBe(false)
    expect(isSpecificCategorySlug('Lingettes nettoyantes bébé')).toBe(false)
    // Vide / null
    expect(isSpecificCategorySlug(null)).toBe(false)
    expect(isSpecificCategorySlug(undefined)).toBe(false)
    expect(isSpecificCategorySlug('')).toBe(false)
    expect(isSpecificCategorySlug('/')).toBe(false)
  })
})

describe('productNameToCategoryPrefix — dernier recours prudent', () => {
  it('classe un nom à mot-clé FORT', () => {
    expect(productNameToCategoryPrefix('Gel de Limpeza Facial CeraVe Pele Oleosa')).toBe(
      'soin-du-corps-et-visage/nettoyant-visage/%',
    )
    expect(productNameToCategoryPrefix('Shampooing doux quotidien')).toBe('coiffure/shampooing/%')
    expect(productNameToCategoryPrefix('Dentifrice blancheur')).toBe(
      'hygiene-dentaire/dentifrice-adulte/%',
    )
  })

  it("S'ABSTIENT sur un nom marketing sans fonction (pas de fourre-tout crème)", () => {
    // « crème »/« jour » (catchAll) sont ignorés pour un NOM → abstention plutôt qu'un faux positif.
    expect(productNameToCategoryPrefix('Nouvelle Peau')).toBeNull()
    expect(productNameToCategoryPrefix('Merveille Absolue')).toBeNull()
    expect(productNameToCategoryPrefix('Ma Crème du Jour')).toBeNull()
    expect(productNameToCategoryPrefix('')).toBeNull()
  })
})

describe('resolveAlternativesQuery — priorité des signaux', () => {
  it('slug catalogue spécifique → match EXACT (le plus précis)', () => {
    const q = resolveAlternativesQuery({
      catalogCategory: 'soin-du-corps-et-visage/nettoyant-visage/gel-nettoyant-visage',
      productType: 'Nettoyant visage',
      productName: 'peu importe',
    })
    expect(q).toEqual({
      kind: 'exact',
      value: 'soin-du-corps-et-visage/nettoyant-visage/gel-nettoyant-visage',
      source: 'catalog-category',
    })
  })

  it('catégorie POUBELLE ignorée → product_type utilisé (préfixe)', () => {
    const q = resolveAlternativesQuery({
      catalogCategory: 'gel',
      productType: 'Nettoyant visage',
      productName: null,
    })
    expect(q).toEqual({
      kind: 'prefix',
      value: 'soin-du-corps-et-visage/nettoyant-visage/%',
      source: 'product-type',
    })
  })

  it('RÉGRESSION bug bêta : catégorie « gel » + product_type null → nom rattrape', () => {
    // Exactement le cas du bêta-testeur : ni catégorie propre, ni product_type.
    const q = resolveAlternativesQuery({
      catalogCategory: 'gel',
      productType: null,
      productName: 'Gel de Limpeza Facial CeraVe Pele Oleosa com 454g',
    })
    expect(q).toEqual({
      kind: 'prefix',
      value: 'soin-du-corps-et-visage/nettoyant-visage/%',
      source: 'product-name',
    })
  })

  it('aucun signal fiable → ABSTENTION (null) : rien plutôt que du hors-sujet', () => {
    expect(
      resolveAlternativesQuery({ catalogCategory: 'gel', productType: null, productName: 'XYZ 42' }),
    ).toBeNull()
    expect(resolveAlternativesQuery({})).toBeNull()
    expect(
      resolveAlternativesQuery({ catalogCategory: null, productType: '', productName: '' }),
    ).toBeNull()
  })
})

describe('detectMisfileLeaf — sérum/nettoyant mal rangé en gommage', () => {
  const G = 'soin-du-corps-et-visage/masque-et-gommage/gommage-visage'

  it('RÉGRESSION Mixa : sérum vitamine C rangé en gommage → sérum anti-age (feuille précise)', () => {
    const r = detectMisfileLeaf('Mixa Sérum Concentré Anti-taches Vitamine C + Acide Glycolique', G)
    // affinage feuille : c'est un SÉRUM → serum-visage-jour-anti-age (pas la crème générique)
    expect(r?.leaf).toBe('soin-du-corps-et-visage/soin-anti-age/serum-visage-jour-anti-age')
    expect(r?.toFamily).toBe('soin-du-corps-et-visage/soin-anti-age')
  })

  it('nettoyant rangé en gommage → nettoyant-visage', () => {
    expect(detectMisfileLeaf('Gel Nettoyant Purifiant Visage', G)?.toFamily).toBe(
      'soin-du-corps-et-visage/nettoyant-visage',
    )
  })

  it('NE touche PAS un vrai gommage/masque (mot exfoliant présent)', () => {
    expect(detectMisfileLeaf('Gommage Visage aux grains d abricot', G)).toBeNull()
    expect(detectMisfileLeaf('Masque Purifiant à l argile', G)).toBeNull()
    expect(detectMisfileLeaf('Exfoliant Peeling Enzymatique', G)).toBeNull()
    // « Sérum-Peeling » : le mot peeling confirme la forme → on garde
    expect(detectMisfileLeaf('Sérum Peeling Nuit Acide Glycolique', G)).toBeNull()
  })

  it('NE touche PAS les catégories hors masque-et-gommage', () => {
    expect(detectMisfileLeaf('Mixa Sérum', 'soin-du-corps-et-visage/soin-anti-age/serum')).toBeNull()
    expect(detectMisfileLeaf('Crème Anti-taches', 'soin-du-corps-et-visage/soin-acne-et-imperfection/soin-anti-taches')).toBeNull()
  })
})

describe('refineLeaf — feuille précise de la vraie taxonomie', () => {
  it('nettoyant : gel / mousse / lait / huile selon le nom', () => {
    expect(refineLeaf('soin-du-corps-et-visage/nettoyant-visage', 'Gel Nettoyant Purifiant')).toBe(
      'soin-du-corps-et-visage/nettoyant-visage/gel-nettoyant-visage',
    )
    expect(refineLeaf('soin-du-corps-et-visage/nettoyant-visage', 'Mousse Nettoyante Douce')).toBe(
      'soin-du-corps-et-visage/nettoyant-visage/mousse-nettoyante-visage',
    )
    expect(refineLeaf('soin-du-corps-et-visage/nettoyant-visage', 'Lait Nettoyant Visage')).toBe(
      'soin-du-corps-et-visage/nettoyant-visage/lait-nettoyant-visage',
    )
  })

  it('produit-de-bain : savon solide vs gel douche vs savon noir', () => {
    expect(refineLeaf('hygiene-du-corps/produit-de-bain', 'Savon Noir Eucalyptus')).toBe(
      'hygiene-du-corps/produit-de-bain/savon-noir',
    )
    expect(refineLeaf('hygiene-du-corps/produit-de-bain', 'Pain de Savon Surgras')).toBe(
      'hygiene-du-corps/produit-de-bain/savon-solide',
    )
    expect(refineLeaf('hygiene-du-corps/produit-de-bain', 'Gel Douche Hydratant')).toBe(
      'hygiene-du-corps/produit-de-bain/gel-douche',
    )
  })

  it('déodorant : bille / stick / spray', () => {
    expect(refineLeaf('hygiene-du-corps/deodorant', 'Déodorant Roll-on 48h')).toBe(
      'hygiene-du-corps/deodorant/deodorant-bille',
    )
    expect(refineLeaf('hygiene-du-corps/deodorant', 'Déo Stick Fraîcheur')).toBe(
      'hygiene-du-corps/deodorant/deodorant-stick',
    )
  })

  it('retombe sur la feuille MODALE sans mot-clé feuille', () => {
    expect(refineLeaf('soin-du-corps-et-visage/nettoyant-visage', 'Truc Machin')).toBe(
      'soin-du-corps-et-visage/nettoyant-visage/gel-nettoyant-visage',
    )
  })

  it('cible toujours une feuille de la famille demandée', () => {
    const leaf = refineLeaf('coiffure/shampooing', 'Shampooing Antipelliculaire')
    expect(leaf?.startsWith('coiffure/shampooing/')).toBe(true)
  })
})

describe('normalizeType', () => {
  it('minuscule + sans accents + trim', () => {
    expect(normalizeType('  Gel de Limpeza FACIAL  ')).toBe('gel de limpeza facial')
    expect(normalizeType(null)).toBe('')
  })
})
