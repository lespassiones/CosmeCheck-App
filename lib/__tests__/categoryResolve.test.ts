/**
 * Tests de la résolution de catégorie de `routine-smart-suggest`.
 *
 * Objectif : garantir que le choix de catégorie (qui pilote la recherche
 * d'alternatives) est FIABLE pour N'IMPORTE QUEL type de produit, et pas
 * seulement le cas ayant révélé le bug (Garancia « Nouvelle Peau » classé à tort
 * en gommage → exfoliant proposé pour remplacer un nettoyant hydratant).
 *
 * On teste :
 *   - productTypeToCategoryPrefix sur TOUS les product_type réels observés en prod
 *     + les cas d'ordre critiques (nettoyant vs gommage, crème vs solaire/mains…) ;
 *   - resolveCategoryPlan (priorité des signaux + garde-fou de confiance).
 */
import {
  MIN_CLASSIFY_VOTES,
  normalizeType,
  productTypeToCategoryPrefix,
  resolveCategoryPlan,
} from '../../supabase/functions/routine-smart-suggest/categoryResolve'

/** Helper : ne garde que le préfixe l1/l2 (sans le `/%`) pour des assertions lisibles. */
function bucket(pt: string | null): string | null {
  const p = productTypeToCategoryPrefix(pt)
  return p ? p.replace(/\/%$/, '') : null
}

describe('productTypeToCategoryPrefix — format', () => {
  it('renvoie un préfixe terminé par /% (utilisable par LIKE)', () => {
    expect(productTypeToCategoryPrefix('Nettoyant visage')).toBe(
      'soin-du-corps-et-visage/nettoyant-visage/%',
    )
    expect(productTypeToCategoryPrefix('Parfum')).toBe('parfum/%')
  })

  it('null/vide/trop court → null', () => {
    expect(productTypeToCategoryPrefix(null)).toBeNull()
    expect(productTypeToCategoryPrefix('')).toBeNull()
    expect(productTypeToCategoryPrefix('  ')).toBeNull()
    expect(productTypeToCategoryPrefix('ab')).toBeNull()
  })

  it('insensible à la casse et aux accents', () => {
    expect(bucket('NETTOYANT VISAGE')).toBe('soin-du-corps-et-visage/nettoyant-visage')
    expect(bucket('crème anti-âge')).toBe('soin-du-corps-et-visage/soin-anti-age')
    expect(bucket('CRÈME ANTI-AGE')).toBe('soin-du-corps-et-visage/soin-anti-age')
  })
})

describe('cas d’ordre CRITIQUES (source du bug)', () => {
  it('un nettoyant/démaquillant ne tombe JAMAIS dans gommage', () => {
    // Le bug : « Nouvelle Peau » faisait classer le nettoyant Garancia en gommage.
    expect(bucket('Nettoyant visage')).toBe('soin-du-corps-et-visage/nettoyant-visage')
    expect(bucket('Cleansing Milk')).toBe('soin-du-corps-et-visage/nettoyant-visage')
    expect(bucket('Lait nettoyant démaquillant')).toBe('soin-du-corps-et-visage/nettoyant-visage')
    // « eau micellaire exfoliante » : le nettoyant PRIME sur l'exfoliant.
    expect(bucket('Eau micellaire exfoliante')).toBe('soin-du-corps-et-visage/nettoyant-visage')
  })

  it('un gommage/exfoliant DÉDIÉ va bien en masque-et-gommage', () => {
    expect(bucket('Gommage pour le visage')).toBe('soin-du-corps-et-visage/masque-et-gommage')
    expect(bucket('Exfoliant visage')).toBe('soin-du-corps-et-visage/masque-et-gommage')
    expect(bucket('Peeling doux')).toBe('soin-du-corps-et-visage/masque-et-gommage')
  })

  it('crème + zone/fonction spécifique gagne sur le fourre-tout crème', () => {
    expect(bucket('Crème solaire')).toBe('produit-solaire/creme-solaire')
    expect(bucket('Crème pour les mains')).toBe('soin-du-corps-et-visage/soin-des-mains')
    expect(bucket('Crème réparatrice pour les mains')).toBe('soin-du-corps-et-visage/soin-des-mains')
    expect(bucket('Crème anti-âge')).toBe('soin-du-corps-et-visage/soin-anti-age')
    expect(bucket('Crème de douche')).toBe('hygiene-du-corps/produit-de-bain')
    expect(bucket('Crème capillaire')).toBe('coiffure/soin-capillaire')
    // fourre-tout : crème sans spécificité → hydratation visage/corps
    expect(bucket('Crème hydratante')).toBe('soin-du-corps-et-visage/creme-hydratante')
    expect(bucket('Crème Visage')).toBe('soin-du-corps-et-visage/creme-hydratante')
  })

  it('un sérum capillaire reste dans les cheveux (pas anti-âge)', () => {
    expect(bucket('Sérum capillaire')).toBe('coiffure/soin-capillaire')
    expect(bucket('Sérum')).toBe('soin-du-corps-et-visage/soin-anti-age')
  })

  it('une brume PARFUMÉE corps & cheveux est un parfum (pas un soin cheveux)', () => {
    expect(bucket('Brume Parfumée Corps & Cheveux')).toBe('parfum')
    expect(bucket('Brume parfumée')).toBe('parfum')
  })
})

describe('couverture de TOUS les product_type réels (prod juil 2026)', () => {
  // [product_type, préfixe l1/l2 attendu]. null = abstention acceptable.
  const CASES: [string, string | null][] = [
    ['Gel douche', 'hygiene-du-corps/produit-de-bain'],
    ['Crème pour les mains', 'soin-du-corps-et-visage/soin-des-mains'],
    ['Crème hydratante', 'soin-du-corps-et-visage/creme-hydratante'],
    ['Shampooing', 'coiffure/shampooing'],
    ['Shampoing', 'coiffure/shampooing'],
    ['Shampoo', 'coiffure/shampooing'],
    ['Shampooing antipelliculaire', 'coiffure/shampooing'],
    ['Lait corporel', 'soin-du-corps-et-visage/creme-hydratante'],
    ['Crème solaire', 'produit-solaire/creme-solaire'],
    ['Sérum', 'soin-du-corps-et-visage/soin-anti-age'],
    ['Dentifrice', 'hygiene-dentaire/dentifrice-adulte'],
    ['Défrisant', 'coiffure/soin-capillaire'],
    ['Sérum capillaire', 'coiffure/soin-capillaire'],
    ['Soin sans rinçage pour cheveux bouclés', 'coiffure/soin-capillaire'],
    ['conditionneur', 'coiffure/soin-capillaire'],
    ['Sérum-huile hybride au bakuchiol', 'soin-du-corps-et-visage/soin-anti-age'],
    ['Cleansing Milk', 'soin-du-corps-et-visage/nettoyant-visage'],
    ['Masque / Après-shampooing / Leave-in', 'coiffure/soin-capillaire'],
    ['Eau micellaire exfoliante', 'soin-du-corps-et-visage/nettoyant-visage'],
    ['Gelée hydratante', 'soin-du-corps-et-visage/creme-hydratante'],
    ['Crème éclaircissante', 'soin-du-corps-et-visage/soin-anti-age'],
    ['Déodorant', 'hygiene-du-corps/deodorant'],
    ['Déodorant Roll-on Anti-transpirant', 'hygiene-du-corps/deodorant'],
    ['Baume', 'soin-du-corps-et-visage/creme-hydratante'],
    ['Huile de douche', 'hygiene-du-corps/produit-de-bain'],
    ['Savon', 'hygiene-du-corps/produit-de-bain'],
    ['Crème émolliente', 'soin-du-corps-et-visage/creme-hydratante'],
    ['Gel lavant intime', 'hygiene-du-corps/hygiene-intime'],
    ['Huile essentielle', 'bien-etre/huile-essentielle'],
    ['Gommage pour le visage', 'soin-du-corps-et-visage/masque-et-gommage'],
    ['Crème anti-âge', 'soin-du-corps-et-visage/soin-anti-age'],
    ['Gel lavant', 'hygiene-du-corps/produit-de-bain'],
    ['Crème Visage', 'soin-du-corps-et-visage/creme-hydratante'],
    ['Crème de jour hydratante anti-âge', 'soin-du-corps-et-visage/soin-anti-age'],
    ['Nettoyant visage', 'soin-du-corps-et-visage/nettoyant-visage'],
    ['Fluide matifiant hydratant', 'soin-du-corps-et-visage/creme-hydratante'],
    ['Gel-crème', 'soin-du-corps-et-visage/creme-hydratante'],
    ['Crème de douche', 'hygiene-du-corps/produit-de-bain'],
    ['Nettoyant en poudre', 'soin-du-corps-et-visage/nettoyant-visage'],
    ['Crème capillaire', 'coiffure/soin-capillaire'],
    ['Crème réparatrice pour les mains', 'soin-du-corps-et-visage/soin-des-mains'],
    ['Soin capillaire réparateur', 'coiffure/soin-capillaire'],
    ['Crème relipidante', 'soin-du-corps-et-visage/creme-hydratante'],
    ['Vernis à ongles', 'manucure-et-pedicure/vernis-et-base-ongles'],
    ['Parfum', 'parfum'],
    // Abstentions acceptables (aucun mot-clé fiable) :
    ['Spray apaisant', null],
    ['Coffret cadeau pour bébé', null],
  ]

  it.each(CASES)('%s → %s', (pt, expected) => {
    expect(bucket(pt)).toBe(expected)
  })
})

describe('resolveCategoryPlan — priorité des signaux', () => {
  const base = {
    eanCatalogCategory: null,
    categoryPrecise: null,
    productTypePrefix: null,
    classifyCategory: null,
    classifyVotes: 0,
  }

  it('EAN catalogue prime sur tout', () => {
    const plan = resolveCategoryPlan({
      ...base,
      eanCatalogCategory: 'a/b/c',
      categoryPrecise: 'x/y/z',
      productTypePrefix: 'p/q/%',
      classifyCategory: 'k/l/m',
      classifyVotes: 99,
    })
    expect(plan).toEqual({ value: 'a/b/c', isPrefix: false, source: 'ean-catalog' })
  })

  it('product_type prime sur category_precise (taxonomies différentes) et classify', () => {
    const plan = resolveCategoryPlan({
      ...base,
      productTypePrefix: 'p/q/%',
      categoryPrecise: 'x/y/z',
      classifyCategory: 'k/l/m',
      classifyVotes: 99,
    })
    expect(plan).toEqual({ value: 'p/q/%', isPrefix: true, source: 'product-type' })
  })

  it('category_precise utilisée seulement si product_type n’a rien mappé', () => {
    const plan = resolveCategoryPlan({
      ...base,
      productTypePrefix: null,
      categoryPrecise: 'x/y/z',
      classifyCategory: 'k/l/m',
      classifyVotes: 99,
    })
    expect(plan).toEqual({ value: 'x/y/z', isPrefix: false, source: 'category-precise' })
  })

  it('product_type (préfixe) avant classify, isPrefix=true', () => {
    const plan = resolveCategoryPlan({
      ...base,
      productTypePrefix: 'soin-du-corps-et-visage/nettoyant-visage/%',
      classifyCategory: 'soin-du-corps-et-visage/masque-et-gommage/gommage-visage',
      classifyVotes: 99,
    })
    expect(plan).toEqual({
      value: 'soin-du-corps-et-visage/nettoyant-visage/%',
      isPrefix: true,
      source: 'product-type',
    })
  })

  it('scénario Laino : category_precise en taxonomie analyseur ignorée au profit du product_type', () => {
    // « Lait corporel » → creme-hydratante (bucket riche), pas la feuille rare
    // `soin.../hydratation/lait-corporel` de category_precise.
    const plan = resolveCategoryPlan({
      ...base,
      productTypePrefix: productTypeToCategoryPrefix('Lait corporel'),
      categoryPrecise: 'soin-du-corps-et-visage/hydratation/lait-corporel',
    })
    expect(plan?.value).toBe('soin-du-corps-et-visage/creme-hydratante/%')
    expect(plan?.source).toBe('product-type')
  })

  it('classify RETENU seulement si votes >= seuil', () => {
    const confident = resolveCategoryPlan({
      ...base,
      classifyCategory: 'a/b/c',
      classifyVotes: MIN_CLASSIFY_VOTES,
    })
    expect(confident).toEqual({ value: 'a/b/c', isPrefix: false, source: 'name-classify' })

    const shaky = resolveCategoryPlan({
      ...base,
      classifyCategory: 'a/b/c',
      classifyVotes: MIN_CLASSIFY_VOTES - 1,
    })
    expect(shaky).toBeNull()
  })

  it('scénario Garancia : classify=gommage 3 votes MAIS product_type=nettoyant → nettoyant gagne', () => {
    const plan = resolveCategoryPlan({
      ...base,
      productTypePrefix: productTypeToCategoryPrefix('Nettoyant visage'),
      classifyCategory: 'soin-du-corps-et-visage/masque-et-gommage/gommage-visage',
      classifyVotes: 3,
    })
    expect(plan?.value).toBe('soin-du-corps-et-visage/nettoyant-visage/%')
    expect(plan?.source).toBe('product-type')
  })

  it('aucun signal fiable → null (abstention)', () => {
    expect(resolveCategoryPlan(base)).toBeNull()
    expect(resolveCategoryPlan({ ...base, classifyCategory: 'a/b/c', classifyVotes: 2 })).toBeNull()
  })
})

describe('normalizeType', () => {
  it('minuscule + sans accents + trim', () => {
    expect(normalizeType('  Crème Éclaircissante  ')).toBe('creme eclaircissante')
    expect(normalizeType(null)).toBe('')
  })
})
