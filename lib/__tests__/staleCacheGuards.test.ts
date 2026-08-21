/**
 * Garde-fous de RÉGRESSION de l'incident « 4 étoiles vertes avec un ingrédient
 * orange en 4e position » (bêta, 21 août 2026).
 *
 * Trois défauts distincts avaient été diagnostiqués en base :
 *
 *  1. `product_analyses` (cache d'analyse pré-calculée, clé = EAN) servait
 *     l'analyse d'un AUTRE produit. EAN 3770035517084 (Vagance, Le Shampoing
 *     capillaire et barbe, INCI naturel de 13 ingrédients) renvoyait l'analyse
 *     d'une eau micellaire à l'eau de rose (12 items, POLOXAMER 184 Orange en
 *     position 4). Rien n'invalidait le cache quand `catalog.ingredients_text`
 *     changeait, et le garde-fou de l'analyser ne comparait QUE le nombre
 *     d'items (12 ≥ 13×0,5 → accepté). → `cacheMatchesInci`.
 *
 *  2. L'écran d'analyse mobile ré-imposait `catalog.score` aux étoiles, ce qui
 *     ANNULAIT l'arbitrage `reconcileScore` déjà fait par l'Edge Function.
 *     Yepoda The Calm Balm : analyse servie 16,55 « Bien » (top5 tout vert),
 *     catalogue 12,9 → 3 étoiles ambres sur mobile contre 4 vertes sur le web.
 *     → `reconcileScore` côté client.
 *
 *  3. Un produit capillaire recevait une catégorie peau (« Crème Capillaire
 *     Koni » → `creme_corps`), et `personal-insights` déduit l'axe du profil de
 *     cette catégorie → textes IA parlant de « ta peau du corps » et malus peau
 *     (huile de coco vs peau grasse) sur un soin cheveux. → `guardHairCategory`.
 */
import { cacheMatchesInci, inciKey } from '../../supabase/functions/analyser/core'
import { guardHairCategory, hasHairMarker } from '../../supabase/functions/analyser/engine'
import { parseInciList } from '../../supabase/functions/analyser/parse'
import { reconcileScore, scoreToneFromScore } from '../analysis/scoreCap'

// INCI réels relevés en prod le 21 août 2026.
const VAGANCE_INCI =
  'Aqua, Urtica Dioica Leaf Water, Cananga Odorata Flower Water, Aloe Barbadensis Leaf Juice, ' +
  'Decyl Glucoside, Sodium Cocoyl Glutamate, Persea Gratissima Oil, Xanthan Gum, Potassium Sorbate, ' +
  'Sodium Benzoate, Propylene Glycol, Citric Acid, Hydrolyzed Rice Protein'

/** Les 12 items que le cache servait pour l'EAN Vagance (eau micellaire). */
const MICELLAR_CACHED_ITEMS = [
  'Aqua', 'Hexylene Glycol', 'Glycerin', 'Poloxamer 184', 'Disodium Cocoamphodiacetate',
  'Disodium EDTA', 'Sodium Chloride', 'Citric Acid', 'Sodium Benzoate', 'Potassium Sorbate',
  'Rosa Damascena Flower Water', 'Fragrance',
].map((input) => ({ input }))

const rawsOf = (inci: string) => parseInciList(inci).map((t) => t.raw)

describe('cacheMatchesInci — cache EAN décrivant un AUTRE produit (défaut 1)', () => {
  it('REJETTE le cache eau micellaire servi sous l’EAN du shampoing Vagance', () => {
    // Le cas exact vu par la bêta : 4 tokens communs sur 12 (Aqua, Citric Acid,
    // Sodium Benzoate, Potassium Sorbate) = 0,33 < 0,6.
    expect(cacheMatchesInci(MICELLAR_CACHED_ITEMS, rawsOf(VAGANCE_INCI))).toBe(false)
  })

  it('ACCEPTE un cache calculé sur le même INCI', () => {
    const raws = rawsOf(VAGANCE_INCI)
    expect(cacheMatchesInci(raws.map((input) => ({ input })), raws)).toBe(true)
  })

  it('ACCEPTE malgré les alias parenthésés retirés par le parser (pas de faux rejet)', () => {
    // Piège qui faisait 36 faux positifs dans le détecteur SQL : le texte source
    // dit « Vitis Vinifera (Grape) Seed Oil », le parser stocke la forme sans
    // parenthèse. La comparaison doit rester raw↔raw.
    const source = 'Vitis Vinifera (Grape) Seed Oil, Corylus Avellana (Hazelnut) Seed Oil, Tocopherol'
    const raws = rawsOf(source)
    expect(cacheMatchesInci(raws.map((input) => ({ input })), raws)).toBe(true)
  })

  it('ACCEPTE malgré les astérisques Ecocert', () => {
    const raws = rawsOf('*Olea Europaea (Olive) Fruit Oil, *Cera Alba (Beeswax), *Ricinus Communis Seed Oil')
    expect(cacheMatchesInci(raws.map((input) => ({ input })), raws)).toBe(true)
  })

  it('REJETTE un cache vide ou sans INCI de référence (pas de confiance par défaut)', () => {
    expect(cacheMatchesInci([], rawsOf(VAGANCE_INCI))).toBe(false)
    expect(cacheMatchesInci(MICELLAR_CACHED_ITEMS, [])).toBe(false)
  })

  it('inciKey neutralise casse, accents et ponctuation', () => {
    expect(inciKey('Rosa Damascena Flower Water')).toBe('ROSADAMASCENAFLOWERWATER')
    expect(inciKey('Aloé-Barbadensis, Leaf')).toBe(inciKey('ALOE BARBADENSIS LEAF'))
  })
})

describe('reconcileScore — les étoiles ne contredisent plus les couleurs (défaut 2)', () => {
  it('garde le score servi quand le catalogue est dans une AUTRE bande (cas Yepoda)', () => {
    // Catalogue 12,9 « Moyen » (ambre) vs analyse servie 16,55 « Bien » (vert),
    // 34/34 ingrédients identifiés → on garde 16,55, donc 4 étoiles vertes,
    // cohérent avec un top5 tout vert et avec le web.
    expect(reconcileScore(12.9, 16.55, 34, 34)).toBe(16.55)
  })

  it('sert le score catalogue quand les deux sont dans la même bande (curation respectée)', () => {
    expect(reconcileScore(16.12, 16.12, 15, 15)).toBe(16.12)
    // 19,5 et 16,3 sont tous deux « vert » → le catalogue gagne.
    expect(reconcileScore(19.5, 16.3, 13, 13)).toBe(19.5)
  })

  it('retombe sur le catalogue si moins de 50 % des ingrédients sont identifiés', () => {
    // Coloriage live non fiable → la curation reste maîtresse.
    expect(reconcileScore(16.3, 8.1, 4, 13)).toBe(16.3)
  })

  it('retombe sur le catalogue si aucun score servi', () => {
    expect(reconcileScore(16.3, null, 13, 13)).toBe(16.3)
    expect(reconcileScore(16.3, undefined, 13, 13)).toBe(16.3)
  })

  it('« Très bien » et « Bien » partagent la bande verte (pas de bascule inutile)', () => {
    expect(scoreToneFromScore(17)).toBe('green')
    expect(scoreToneFromScore(13)).toBe('green')
    expect(scoreToneFromScore(12.9)).toBe('amber')
    expect(scoreToneFromScore(8.9)).toBe('orange')
    expect(scoreToneFromScore(4.9)).toBe('rose')
  })
})

describe('guardHairCategory — un produit cheveux n’est plus rangé en catégorie peau (défaut 3)', () => {
  it('corrige le cas réel « Crème Capillaire Koni » classé creme_corps', () => {
    expect(guardHairCategory('creme_corps', 'Crème Capillaire Koni')).toBe('apres_shampooing')
  })

  it('corrige les shampoings rangés en nettoyant_visage ou creme_corps (cas relevés en base)', () => {
    expect(guardHairCategory('nettoyant_visage', 'LAO Care Shampoing Purifiant')).toBe('shampooing')
    expect(guardHairCategory('creme_corps', "Shampoing Solide au Rhassoul OL'AFRO")).toBe('shampooing')
    expect(guardHairCategory('creme_visage', 'Crème capillaire Olafro')).toBe('apres_shampooing')
  })

  it('distingue après-shampooing de shampooing (sous-chaîne piégeuse)', () => {
    expect(guardHairCategory('creme_corps', 'Après-shampoing démêlant')).toBe('apres_shampooing')
    expect(guardHairCategory('creme_corps', 'Shampoing doux hydratant')).toBe('shampooing')
  })

  it('couvre le shampoing barbe de la capture (« capillaire et barbe »)', () => {
    expect(guardHairCategory('creme_corps', 'Vagance Le Shampoing capillaire et barbe')).toBe('shampooing')
  })

  it('comble une catégorie ABSENTE sur un produit capillaire', () => {
    expect(guardHairCategory(null, 'Masque Hydratant Cheveux Secs')).toBe('apres_shampooing')
  })

  it('NE TOUCHE PAS un vrai produit peau (aucun marqueur capillaire)', () => {
    expect(guardHairCategory('creme_corps', 'Lait Corps Hydratant Karité')).toBe('creme_corps')
    expect(guardHairCategory('nettoyant_visage', 'Gel Nettoyant Purifiant Cicafalte+')).toBe('nettoyant_visage')
    expect(guardHairCategory('creme_visage', "Lotion Tonique à l'Acide Glycolique 7%")).toBe('creme_visage')
    expect(guardHairCategory(null, 'Sérum Niacinamide 10%')).toBeNull()
  })

  it('NE TOUCHE PAS un produit MULTI-ZONE corps et cheveux (cas réels en base)', () => {
    // Reclasser une brume parfumée « Corps & Cheveux » en soin capillaire serait
    // l'erreur symétrique de celle qu'on corrige.
    expect(
      guardHairCategory('parfum', 'Yves Rocher Framboise & Menthe Poivrée Brume Parfumée Corps & Cheveux - 100 ml'),
    ).toBe('parfum')
    expect(guardHairCategory('creme_corps', 'Beauté Insolente Crème Pure Energie 3 en 1 cheveux')).toBe('creme_corps')
  })

  it('laisse un parfum en parfum même sans marqueur multi-zone', () => {
    expect(guardHairCategory('parfum', 'Chanel No 5 Hair Mist')).toBe('parfum')
  })

  it('NE TOUCHE PAS une catégorie déjà capillaire', () => {
    expect(guardHairCategory('shampooing', 'Shampoing antipelliculaire')).toBe('shampooing')
    expect(guardHairCategory('apres_shampooing', 'Masque capillaire')).toBe('apres_shampooing')
  })

  it('hasHairMarker reste insensible à la casse et aux accents', () => {
    expect(hasHairMarker('CRÈME CAPILLAIRE')).toBe(true)
    expect(hasHairMarker('soin cheveux')).toBe(true)
    expect(hasHairMarker('crème pour le corps')).toBe(false)
    expect(hasHairMarker(null)).toBe(false)
  })
})
