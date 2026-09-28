/**
 * Résolveur de CONTEXTE PRODUIT (personal-insights/productContext).
 *
 * Retour bêta du 28 sept 2026 : « Il analyse les ingrédients d'une crème cheveux
 * comme si c'était pour le visage. » La zone du produit était lue sur UNE chaîne
 * (le texte libre en premier) et visage/corps étaient fusionnés. On vérifie ici
 * l'ordre des signaux (catalogue, nom, texte libre, catégorie LLM, INCI), la
 * distinction visage/corps et la détection rincé / sans rinçage.
 */
import {
  describeUsage,
  describeZones,
  isCatalogSlug,
  pickCatalogSlug,
  profileAxisOf,
  resolveProductContext,
  usageFromText,
  zoneKey,
} from '../../supabase/functions/personal-insights/productContext'
import { categoryToAxis } from '../../supabase/functions/personal-insights/relevance'

const inci = (...names: string[]) => names.map((name) => ({ name }))

describe('resolveProductContext : catégorie catalogue (source de vérité)', () => {
  it('coiffure : cheveux, usage lu sur la feuille', () => {
    expect(resolveProductContext({ catalogCategory: 'coiffure/soin-capillaire/masque-capillaire' })).toMatchObject({
      axis: 'hair', usage: 'rinse_off', source: 'catalog',
    })
    expect(resolveProductContext({ catalogCategory: 'coiffure/soin-capillaire/demelant-sans-rincage' })).toMatchObject({
      axis: 'hair', usage: 'leave_on',
    })
    expect(resolveProductContext({ catalogCategory: 'coiffure/shampooing/shampooing-antipelliculaire' })).toMatchObject({
      axis: 'hair', usage: 'rinse_off',
    })
  })

  it('visage et corps sont DISTINCTS', () => {
    expect(resolveProductContext({ catalogCategory: 'soin-du-corps-et-visage/nettoyant-visage/gel-nettoyant-visage' }))
      .toMatchObject({ axis: 'face', zones: ['face'], usage: 'rinse_off' })
    // La feuille prime pour l'usage : un tonique reste sur la peau.
    expect(resolveProductContext({ catalogCategory: 'soin-du-corps-et-visage/nettoyant-visage/tonique-visage' }))
      .toMatchObject({ axis: 'face', usage: 'leave_on' })
    expect(resolveProductContext({ catalogCategory: 'soin-du-corps-et-visage/creme-hydratante/hydratant-corps' }))
      .toMatchObject({ axis: 'body', zones: ['body'], usage: 'leave_on' })
    expect(resolveProductContext({ catalogCategory: 'hygiene-du-corps/produit-de-bain/gel-douche' }))
      .toMatchObject({ axis: 'body', usage: 'rinse_off' })
  })

  it('zones ciblées : lèvres, yeux, mains, pieds, aisselles, bouche, ongles', () => {
    expect(resolveProductContext({ catalogCategory: 'soin-du-corps-et-visage/soin-des-levres/baume-a-levres' }).axis).toBe('lips')
    expect(resolveProductContext({ catalogCategory: 'soin-du-corps-et-visage/soin-des-yeux/anti-poches-anti-cernes' }).axis).toBe('eyes')
    expect(resolveProductContext({ catalogCategory: 'soin-du-corps-et-visage/soin-des-mains/creme-pour-les-mains' }).axis).toBe('hands')
    expect(resolveProductContext({ catalogCategory: 'soin-du-corps-et-visage/soin-des-pieds-et-jambes/hydratants-pour-les-pieds' }).axis).toBe('feet')
    expect(resolveProductContext({ catalogCategory: 'hygiene-du-corps/deodorants/deodorant-bille' }).axis).toBe('underarm')
    expect(resolveProductContext({ catalogCategory: 'hygiene-dentaire/dentifrice-adulte/dentifrice' }).axis).toBe('oral')
    expect(resolveProductContext({ catalogCategory: 'manucure-et-pedicure/vernis-et-base-ongles/vernis-a-ongles' }).axis).toBe('nails')
    expect(resolveProductContext({ catalogCategory: 'maquillage/maquillage-a-levres/rouge-a-levres' })).toMatchObject({
      axis: 'lips', makeup: true,
    })
  })

  it('le catalogue curé passe AVANT le texte libre (inversion de l’ancienne priorité)', () => {
    // Avant : productType « Crème » passait devant et rangeait le soin en « peau ».
    const ctx = resolveProductContext({
      catalogCategory: 'coiffure/soin-capillaire/masque-capillaire',
      productType: 'Crème',
      productName: 'Crème nourrissante karité',
    })
    expect(ctx.axis).toBe('hair')
    expect(ctx.source).toBe('catalog')
  })

  it('un slug catalogue rangé dans result_json.category est reconnu comme curé', () => {
    const ctx = resolveProductContext({ categories: ['coiffure/soin-capillaire/apres-shampooing', null], productType: 'Crème' })
    expect(ctx).toMatchObject({ axis: 'hair', source: 'catalog' })
  })

  it('catalogue « peau, zone inconnue » : le nom précise visage/corps mais ne rebascule JAMAIS en cheveux', () => {
    expect(resolveProductContext({
      catalogCategory: 'soin-du-corps-et-visage/creme-hydratante/gel-aloe-vera',
      productName: 'Gel aloe vera visage',
    })).toMatchObject({ axis: 'face', source: 'name' })
    const locked = resolveProductContext({
      catalogCategory: 'soin-du-corps-et-visage/creme-hydratante/gel-aloe-vera',
      productName: 'Gel aloe vera cheveux',
    })
    expect(locked.zones).toEqual(['face', 'body'])
    expect(locked.source).toBe('catalog')
    expect(locked.zoneCertain).toBe(false)
  })
})

describe('resolveProductContext : nom du produit', () => {
  it('cas bêta : « Crème Capillaire Koni » rangée creme_corps par le LLM', () => {
    const ctx = resolveProductContext({
      categories: ['creme_corps'],
      productName: 'Crème Capillaire Koni',
      items: inci('Aqua', 'Butyrospermum Parkii Butter', 'Cocos Nucifera Oil'),
    })
    expect(ctx).toMatchObject({ axis: 'hair', zones: ['hair'], usage: 'leave_on', source: 'name' })
  })

  it('soins capillaires variés (nouveaux marqueurs)', () => {
    for (const name of [
      'Leave-in Curl Cream',
      'Soin sans rinçage boucles définies',
      'Masque cheveux crépus au karité',
      'Huile pointes sèches',
      'Crème coiffante pour cheveux frisés',
      'Co-wash hydratant',
      'Défrisant doux',
      'Sérum capillaire anti-chute',
      'Lotion tonique cuir chevelu',
    ]) {
      expect(resolveProductContext({ productName: name }).zones).toEqual(['hair'])
    }
  })

  it('usage : rincé vs sans rinçage lu dans le nom', () => {
    expect(resolveProductContext({ productName: 'Shampooing doux' }).usage).toBe('rinse_off')
    expect(resolveProductContext({ productName: 'Après-shampooing démêlant' }).usage).toBe('rinse_off')
    expect(resolveProductContext({ productName: 'Après-shampooing sans rinçage' }).usage).toBe('leave_on')
    expect(resolveProductContext({ productName: 'Shampooing sec volume' }).usage).toBe('leave_on')
    expect(resolveProductContext({ productName: 'Crème visage hydratante' })).toMatchObject({ axis: 'face', usage: 'leave_on' })
    expect(resolveProductContext({ productName: 'Lait corps nourrissant' })).toMatchObject({ axis: 'body', usage: 'leave_on' })
    expect(resolveProductContext({ productName: 'Gel douche surgras' })).toMatchObject({ axis: 'body', usage: 'rinse_off' })
    expect(resolveProductContext({ productName: 'Crème de douche' }).usage).toBe('rinse_off')
    expect(resolveProductContext({ productName: 'Huile démaquillante' })).toMatchObject({ axis: 'face', usage: 'rinse_off' })
  })

  it('multi-zones : la peau d’abord, les cheveux en plus', () => {
    const ctx = resolveProductContext({ productName: 'Huile sèche corps et cheveux' })
    expect(ctx.axis).toBe('body')
    expect(ctx.zones).toEqual(['body', 'hair'])
  })

  it('un produit capillaire qui porte un mot « visage implicite » reste capillaire', () => {
    // « sérum » ou « tonique » à côté d'un marqueur cheveux ne créent pas de zone visage.
    expect(resolveProductContext({ productName: 'Sérum cheveux anti-âge' }).zones).toEqual(['hair'])
  })

  it('brume parfumée « corps & cheveux » : un parfum, hors profil', () => {
    const ctx = resolveProductContext({
      productName: 'Yves Rocher Framboise & Menthe Poivrée Brume Parfumée Corps & Cheveux - 100 ml',
    })
    expect(ctx.axis).toBe('none')
  })

  it('« The Body Shop » est une marque, pas une zone corps', () => {
    expect(resolveProductContext({ productName: 'The Body Shop Ginger Shampoo' }).zones).toEqual(['hair'])
  })

  it('mascara « boucles » ou « curl » : maquillage des yeux, jamais cheveux', () => {
    expect(resolveProductContext({ productName: 'Mascara Volume Curl' })).toMatchObject({ axis: 'eyes', makeup: true })
    expect(resolveProductContext({ productName: 'Mascara boucles intenses' })).toMatchObject({ axis: 'eyes' })
  })

  it('crème solaire visage : visage ; crème solaire seule : visage OU corps (incertain)', () => {
    expect(resolveProductContext({ productName: 'Crème solaire visage SPF50' }).zones).toEqual(['face'])
    const sun = resolveProductContext({ productName: 'Crème solaire SPF50' })
    expect(sun.zones).toEqual(['body', 'face'])
    expect(sun.zoneCertain).toBe(false)
  })

  it('crème mains et ongles : les mains, pas les ongles', () => {
    expect(resolveProductContext({ productName: 'Crème mains et ongles' }).axis).toBe('hands')
  })
})

describe('resolveProductContext : indices ingrédients (dernier recours)', () => {
  it('conditionneurs capillaires : cheveux', () => {
    expect(resolveProductContext({
      items: inci('Aqua', 'Cetearyl Alcohol', 'Behentrimonium Chloride', 'Amodimethicone'),
    })).toMatchObject({ axis: 'hair', source: 'ingredients' })
  })

  it('un nom générique (« Crème riche ») ne tranche pas : l’INCI capillaire l’emporte', () => {
    expect(resolveProductContext({
      productName: 'Crème riche',
      items: inci('Aqua', 'Behentrimonium Methosulfate', 'Cetyl Alcohol'),
    }).axis).toBe('hair')
  })

  it('polyquaternium + guar seuls (gel douche classique) : PAS cheveux', () => {
    const ctx = resolveProductContext({
      items: inci('Aqua', 'Sodium Laureth Sulfate', 'Cocamidopropyl Betaine', 'Polyquaternium-7', 'Guar Hydroxypropyltrimonium Chloride'),
    })
    expect(ctx.axis).toBe('none')
    expect(ctx.usage).toBe('rinse_off') // base lavante en tête
  })

  it('fluor : bouche ; sels d’aluminium : aisselles', () => {
    expect(resolveProductContext({ items: inci('Sorbitol', 'Hydrated Silica', 'Sodium Fluoride') }).axis).toBe('oral')
    expect(resolveProductContext({ items: inci('Aluminum Chlorohydrate', 'Aqua') }).axis).toBe('underarm')
  })

  it('aucun signal : hors profil', () => {
    expect(resolveProductContext({})).toMatchObject({ axis: 'none', zones: ['none'], source: 'none' })
  })
})

describe('parité avec l’ancien categoryToAxis (gating profil inchangé)', () => {
  it('même axe de profil sur la table des slugs historiques', () => {
    for (const slug of [
      'hygiene-du-corps/produit-de-bain/gel-douche',
      'hygiene-du-corps/savon/savon-solide',
      'hygiene-du-corps/deodorant/deodorant-bille',
      'hygiene-du-corps/deodorants/deodorant-spray',
      'hygiene-du-corps/hygiene-intime/toilette-intime',
      'hygiene-du-corps/anti-poux/lotion',
      'maquillage/fond-de-teint-et-poudre/fond-de-teint',
      'maquillage/demaquillant/eau-micellaire',
      'maquillage/fixateur-de-maquillage/spray',
      'maquillage/maquillage-a-levres/rouge-a-levres',
      'maquillage/maquillage-des-yeux/mascara',
      'maquillage/palette-de-maquillage/palette',
      'rasage-et-epilation/mousse-et-gel-de-rasage/mousse-a-raser',
      'rasage-et-epilation/apres-rasage/baume-apres-rasage',
      'rasage-et-epilation/epilation-et-cire/creme-depilatoire-corps',
      'rasage-et-epilation/soin-de-la-barbe/huile-barbe',
      'rasage-et-epilation/lames-de-rasoir/lames',
      'bien-etre/massage/huile-de-massage',
      'bien-etre/huile-essentielle/huile-essentielle',
      'soin-du-corps-et-visage/hydratant-corps/lait-corps',
      'soin-du-corps-et-visage/creme-hydratante/creme-visage',
      'produit-solaire/creme-solaire/creme-solaire',
      'coiffure/shampooing/shampooing-classique',
      'parfum/parfum-mixte/eau-de-parfum-mixte',
      'hygiene-dentaire/dentifrice-adulte/dentifrice',
      'manucure-et-pedicure/vernis-et-base-ongles/vernis-a-ongles',
      'soin-et-hygiene-bebe/soin-bebe',
      'sante/pansement',
    ]) {
      expect([slug, profileAxisOf(resolveProductContext({ catalogCategory: slug }))]).toEqual([slug, categoryToAxis(slug)])
    }
  })

  it('libellés texte historiques', () => {
    for (const c of ['Shampooing Antipelliculaire', 'Après-shampoing', 'Masque cheveux', 'Soin capillaire', 'Revitalisant', 'Coloration', 'Gel coiffant']) {
      expect(profileAxisOf(resolveProductContext({ productType: c }))).toBe('hair')
    }
    for (const c of ['Crème visage', 'Lait corps', 'Sérum hydratant', 'Gel douche', 'Nettoyant visage', 'Crème solaire SPF50', 'Fond de teint', 'Contour des yeux']) {
      expect(profileAxisOf(resolveProductContext({ productType: c }))).toBe('skin')
    }
    for (const c of ['Dentifrice', 'Brosse à dents', 'Bain de bouche', 'Déodorant', 'Parfum', 'Eau de toilette', 'Bougie parfumée']) {
      expect(profileAxisOf(resolveProductContext({ productType: c }))).toBe('none')
    }
  })
})

describe('utilitaires', () => {
  it('isCatalogSlug / pickCatalogSlug : enums et libellés bruts exclus', () => {
    expect(isCatalogSlug('coiffure/soin-capillaire')).toBe(true)
    expect(isCatalogSlug('coiffure')).toBe(true)
    expect(isCatalogSlug('creme_corps')).toBe(false)
    expect(isCatalogSlug('Crème solaire adulte')).toBe(false)
    expect(isCatalogSlug('gel')).toBe(false)
    expect(pickCatalogSlug({ catalogCategory: null, categories: ['creme_corps', 'coiffure/shampooing/x'] })).toBe('coiffure/shampooing/x')
  })

  it('usageFromText : sans rinçage explicite prioritaire', () => {
    expect(usageFromText('apres shampooing sans rincage')).toBe('leave_on')
    expect(usageFromText('baume apres rasage')).toBe('leave_on')
    expect(usageFromText('mousse a raser')).toBe('rinse_off')
    expect(usageFromText('')).toBe('unknown')
  })

  it('zoneKey / libellés stables et sans tiret long', () => {
    const ctx = resolveProductContext({ productName: 'Huile sèche corps et cheveux' })
    expect(zoneKey(ctx)).toBe('body+hair|leave_on')
    expect(zoneKey(null)).toBe('nozone')
    const text = `${describeZones(ctx)} ${describeUsage('rinse_off')} ${describeUsage('leave_on')} ${describeUsage('unknown')}`
    expect(text).not.toMatch(new RegExp('[' + String.fromCharCode(0x2013, 0x2014) + ']'))
  })
})
