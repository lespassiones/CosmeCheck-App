/**
 * formulation : classement de la forme galénique à partir de l'INCI, et
 * affinité entre deux formes (filtre des alternatives).
 *
 * Retour bêta (sept 2026) : « pour une crème dont le premier ingrédient est
 * l'eau, l'alternative doit être une crème dont le premier ingrédient est
 * l'eau ». Les INCI ci-dessous sont des listes RÉELLES (catalogue / étiquettes).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  affinityRank,
  classifyFormulation,
  formulationAffinity,
  splitInci,
  type Galenic,
} from '@/lib/inci/formulation'

const g = (inci: string | string[]) => classifyFormulation(inci).galenic

describe('splitInci : formes réelles des listes', () => {
  it('parenthèses, slash de synonymes, astérisques bio, entités HTML', () => {
    expect(splitInci('AQUA (WATER), GLYCERIN*, BUTYROSPERMUM PARKII (SHEA) BUTTER**')).toEqual([
      'AQUA WATER',
      'GLYCERIN',
      'BUTYROSPERMUM PARKII SHEA BUTTER',
    ])
    expect(splitInci('Aqua/Water/Eau, Glycerin&quot;, Parfum')).toEqual(['AQUA/WATER/EAU', 'GLYCERIN', 'PARFUM'])
  })

  it('1,2-hexanediol reste un seul nom, les listes à points sont découpées', () => {
    expect(splitInci('AQUA, 1,2-HEXANEDIOL, GLYCERIN')).toEqual(['AQUA', '1.2-HEXANEDIOL', 'GLYCERIN'])
    expect(splitInci('AQUA (WATER). PARAFFINUM LIQUIDUM. STEARIC ACID.')).toEqual([
      'AQUA WATER',
      'PARAFFINUM LIQUIDUM',
      'STEARIC ACID',
    ])
  })

  it('retour ligne au milieu d un nom recollé, en-tête « Ingrédients : » retiré', () => {
    expect(splitInci('Ingrédients : AQUA, GLYCERYL\nSTEARATE, CETYL ALCOHOL')).toEqual([
      'AQUA',
      'GLYCERYL STEARATE',
      'CETYL ALCOHOL',
    ])
  })

  it('tableau de noms (items de l analyse) et entrées vides', () => {
    expect(splitInci(['Aqua', ' Glycerin ', ''])).toEqual(['AQUA', 'GLYCERIN'])
    expect(splitInci(null)).toEqual([])
    expect(splitInci('')).toEqual([])
  })
})

describe('classifyFormulation : INCI réels', () => {
  const CASES: [string, string, Galenic][] = [
    // Crèmes eau en premier (émulsions)
    [
      'Nivea Crème',
      'AQUA, PARAFFINUM LIQUIDUM, CERA MICROCRISTALLINA, GLYCERIN, LANOLIN ALCOHOL (EUCERIT), PARAFFIN, PANTHENOL, MAGNESIUM SULFATE, DECYL OLEATE, OCTYLDODECANOL, ALUMINUM STEARATES, CITRIC ACID, MAGNESIUM STEARATE, LIMONENE, PARFUM',
      'emulsion',
    ],
    [
      'CeraVe crème hydratante',
      'AQUA/WATER, GLYCERIN, CETEARYL ALCOHOL, CAPRYLIC/CAPRIC TRIGLYCERIDE, CETYL ALCOHOL, CETEARETH-20, PETROLATUM, POTASSIUM PHOSPHATE, CERAMIDE NP, CERAMIDE AP, CERAMIDE EOP, CARBOMER, DIMETHICONE',
      'emulsion',
    ],
    [
      'Crème bio (AQUA/WATER/EAU, astérisques)',
      'Aqua/Water/Eau, Glycerin*, Butyrospermum Parkii (Shea) Butter*, Cetearyl Alcohol, Glyceryl Stearate, Sodium Stearoyl Glutamate, Tocopherol',
      'emulsion',
    ],
    // Sérum aqueux
    [
      'Sérum acide hyaluronique',
      'Aqua (Water), Sodium Hyaluronate, Pentylene Glycol, Propanediol, Sodium Hyaluronate Crosspolymer, Panthenol, Ahnfeltiopsis Concinna Extract, Glycerin, Trisodium Ethylenediamine Disuccinate, Citric Acid, Isoceteth-20, Ethoxydiglycol, Ethylhexylglycerin, Hexylene Glycol, 1,2-Hexanediol, Phenoxyethanol, Caprylyl Glycol',
      'aqueous',
    ],
    [
      'Eau micellaire',
      'AQUA / WATER, HEXYLENE GLYCOL, GLYCERIN, DISODIUM COCOAMPHODIACETATE, DISODIUM EDTA, POLOXAMER 184, POLYAMINOPROPYL BIGUANIDE',
      'aqueous',
    ],
    [
      'Gel d aloe vera',
      'ALOE BARBADENSIS LEAF JUICE*, GLYCERIN, XANTHAN GUM, CITRIC ACID, POTASSIUM SORBATE, SODIUM BENZOATE',
      'aqueous',
    ],
    // Huiles
    [
      'Huile sèche',
      'CAPRYLIC/CAPRIC TRIGLYCERIDE, DICAPRYLYL ETHER, MACADAMIA TERNIFOLIA SEED OIL, PRUNUS AMYGDALUS DULCIS (SWEET ALMOND) OIL, CORYLUS AVELLANA (HAZEL) SEED OIL, TOCOPHEROL, BORAGO OFFICINALIS SEED OIL, PARFUM (FRAGRANCE), LINALOOL',
      'anhydrous_oil',
    ],
    ['Huile de jojoba pure', 'SIMMONDSIA CHINENSIS SEED OIL', 'anhydrous_oil'],
    [
      'Huile démaquillante',
      'OLEA EUROPAEA (OLIVE) FRUIT OIL, SORBETH-30 TETRAOLEATE, CETYL ETHYLHEXANOATE, PHENOXYETHANOL, TOCOPHEROL, STEARYL GLYCYRRHETINATE, ROSMARINUS OFFICINALIS (ROSEMARY) LEAF OIL',
      'anhydrous_oil',
    ],
    [
      'Huile de douche (huile + tensioactif, sans eau)',
      'GLYCINE SOJA OIL, MIPA-LAURETH SULFATE, LAURETH-4, COCAMIDE DEA, PARFUM, PRUNUS AMYGDALUS DULCIS OIL, TOCOPHEROL',
      'anhydrous_oil',
    ],
    // Baumes
    ['Beurre de karité pur', 'Butyrospermum Parkii (Shea) Butter*', 'anhydrous_balm'],
    [
      'Baume à lèvres',
      'Ricinus Communis Seed Oil, Cera Alba, Butyrospermum Parkii Butter, Cocos Nucifera Oil, Tocopherol, Parfum',
      'anhydrous_balm',
    ],
    ['Vaseline', 'PETROLATUM', 'anhydrous_balm'],
    // Savons solides
    ['Savon de Marseille', 'SODIUM OLIVATE, AQUA, SODIUM CHLORIDE, SODIUM HYDROXIDE', 'soap_bar'],
    ["Savon d'Alep (huiles + soude)", 'Olea Europaea Fruit Oil, Laurus Nobilis Fruit Oil, Aqua, Sodium Hydroxide', 'soap_bar'],
    [
      'Pain surgras syndet',
      'SODIUM LAUROYL ISETHIONATE, STEARIC ACID, SODIUM TALLOWATE, SODIUM PALMATE, LAURIC ACID, SODIUM ISETHIONATE, AQUA, SODIUM STEARATE, COCAMIDOPROPYL BETAINE',
      'soap_bar',
    ],
    [
      'Shampooing solide',
      'SODIUM COCO-SULFATE, CETEARYL ALCOHOL, THEOBROMA CACAO SEED BUTTER, AQUA, PARFUM',
      'soap_bar',
    ],
    // Bases lavantes liquides
    [
      'Gel douche SLES',
      'AQUA, SODIUM LAURETH SULFATE, COCAMIDOPROPYL BETAINE, SODIUM CHLORIDE, GLYCERIN, PARFUM, CITRIC ACID, SODIUM BENZOATE',
      'wash',
    ],
    [
      'Shampooing antipelliculaire',
      'AQUA / WATER, SODIUM LAURETH SULFATE, SODIUM LAURYL SULFATE, GLYCOL DISTEARATE, ZINC PYRITHIONE, COCAMIDE MEA, DIMETHICONE, SODIUM CHLORIDE',
      'wash',
    ],
    [
      'Savon liquide (savon de potassium)',
      'AQUA, POTASSIUM OLEATE, POTASSIUM COCOATE, COCO-GLUCOSIDE, POTASSIUM OLIVATE, GLYCERIN',
      'wash',
    ],
    // Émulsions spécifiques
    [
      'Après-shampooing',
      'AQUA, CETEARYL ALCOHOL, BEHENTRIMONIUM CHLORIDE, AMODIMETHICONE, CETYL ESTERS, ISOPROPYL ALCOHOL, PARFUM, TRIDECETH-10, CITRIC ACID',
      'emulsion',
    ],
    [
      'Lait démaquillant',
      'AQUA, PARAFFINUM LIQUIDUM, GLYCERIN, CETEARYL ALCOHOL, ISOPROPYL PALMITATE, CETEARETH-20, PARFUM, CARBOMER, SODIUM HYDROXIDE',
      'emulsion',
    ],
    [
      'Crème solaire (sarcosinate d isopropyle = émollient, pas un lavant)',
      'AQUA, ISOPROPYL LAUROYL SARCOSINATE, PHENOXYETHYL CAPRYLATE, DIETHYLAMINO HYDROXYBENZOYL HEXYL BENZOATE, ETHYLHEXYL TRIAZONE, GLYCERIN',
      'emulsion',
    ],
    [
      'Crème de coloration (alcool gras avant les tensioactifs)',
      'AQUA, CETEARYL ALCOHOL, ETHANOLAMINE, COCONUT ALCOHOL, SODIUM LAURETH-6 CARBOXYLATE, SODIUM MYRETH SULFATE, TOLUENE-2,5-DIAMINE SULFATE',
      'emulsion',
    ],
    // Alcooliques
    ['Eau de parfum', 'ALCOHOL DENAT., PARFUM (FRAGRANCE), AQUA (WATER), LIMONENE, LINALOOL, COUMARIN', 'alcoholic'],
    [
      'Spray solaire alcoolique (propulseur ignoré)',
      'BUTANE, ALCOHOL DENAT, C12-15 ALKYL BENZOATE, OCTOCRYLENE, HOMOSALATE',
      'alcoholic',
    ],
    // Poudres
    [
      'Poudre compacte',
      'TALC, MICA, ZINC STEARATE, DIMETHICONE, CAPRYLIC/CAPRIC TRIGLYCERIDE, PHENOXYETHANOL, CI 77891',
      'powder',
    ],
    ['Argile blanche', 'KAOLIN', 'powder'],
    ['Sels de bain', 'SODIUM CHLORIDE, MAGNESIUM SULFATE, PARFUM, LAVANDULA ANGUSTIFOLIA OIL', 'powder'],
    // Gommage sucre + huiles : anhydre
    ['Gommage sucre et huiles', 'SUCROSE, PRUNUS AMYGDALUS DULCIS OIL, HELIANTHUS ANNUUS SEED OIL, PARFUM', 'anhydrous_oil'],
    // Hors référentiel : abstention
    ['Dentifrice', 'AQUA, HYDRATED SILICA, SORBITOL, SODIUM LAURYL SULFATE, AROMA, SODIUM FLUORIDE', 'unknown'],
    ['Vernis', 'BUTYL ACETATE, ETHYL ACETATE, NITROCELLULOSE, ACETYL TRIBUTYL CITRATE, ISOPROPYL ALCOHOL', 'unknown'],
    ['Stick déodorant au stéarate', 'PROPYLENE GLYCOL, AQUA, SODIUM STEARATE, PARFUM', 'unknown'],
  ]

  it.each(CASES)('%s', (_label, inci, expected) => {
    expect(g(inci)).toBe(expected)
  })

  it('waterFirst : vrai pour eau, aloe ou hydrolat en tête, faux sinon', () => {
    expect(classifyFormulation('AQUA (WATER), GLYCERIN, CETEARYL ALCOHOL').waterFirst).toBe(true)
    expect(classifyFormulation('ROSA DAMASCENA FLOWER WATER, GLYCERIN').waterFirst).toBe(true)
    expect(classifyFormulation('ALOE BARBADENSIS LEAF JUICE, GLYCERIN').waterFirst).toBe(true)
    expect(classifyFormulation('GLYCERIN, AQUA, SODIUM LAURETH SULFATE').waterFirst).toBe(false)
    expect(classifyFormulation('PRUNUS AMYGDALUS DULCIS OIL').waterFirst).toBe(false)
  })

  it('accepte un tableau de noms (items de l analyse triés par position)', () => {
    expect(g(['Aqua', 'Glycerin', 'Cetearyl Alcohol', 'Caprylic/Capric Triglyceride'])).toBe('emulsion')
    expect(g(['Aqua', 'Sodium Laureth Sulfate', 'Cocamidopropyl Betaine'])).toBe('wash')
  })

  it('entrée vide ou illisible : unknown, confiance 0', () => {
    expect(classifyFormulation('')).toEqual({ galenic: 'unknown', waterFirst: false, confidence: 0 })
    expect(classifyFormulation(null).galenic).toBe('unknown')
    expect(classifyFormulation([]).galenic).toBe('unknown')
    expect(g('CENTELLA ASIATICA EXTRACT, HYALURONIC ACID, NIACINAMIDE')).toBe('unknown')
  })

  it('confiance bornée dans ]0, 1] pour un type connu', () => {
    const f = classifyFormulation('AQUA, SODIUM LAURETH SULFATE, COCAMIDOPROPYL BETAINE')
    expect(f.confidence).toBeGreaterThan(0)
    expect(f.confidence).toBeLessThanOrEqual(1)
  })
})

describe('formulationAffinity : filtre avec repli', () => {
  it('même type : same', () => {
    expect(formulationAffinity('emulsion', 'emulsion')).toBe('same')
    expect(formulationAffinity('soap_bar', 'soap_bar')).toBe('same')
  })

  it('voisins admis : aqueux et émulsion, huile et baume, alcoolique et aqueux', () => {
    expect(formulationAffinity('aqueous', 'emulsion')).toBe('near')
    expect(formulationAffinity('emulsion', 'aqueous')).toBe('near')
    expect(formulationAffinity('anhydrous_oil', 'anhydrous_balm')).toBe('near')
    expect(formulationAffinity('anhydrous_balm', 'anhydrous_oil')).toBe('near')
    expect(formulationAffinity('alcoholic', 'aqueous')).toBe('near')
  })

  it('opposés : jamais de savon solide pour un gel douche, jamais d huile pour une crème', () => {
    expect(formulationAffinity('wash', 'soap_bar')).toBe('opposite')
    expect(formulationAffinity('soap_bar', 'wash')).toBe('opposite')
    expect(formulationAffinity('emulsion', 'anhydrous_oil')).toBe('opposite')
    expect(formulationAffinity('emulsion', 'anhydrous_balm')).toBe('opposite')
    expect(formulationAffinity('aqueous', 'anhydrous_oil')).toBe('opposite')
    expect(formulationAffinity('powder', 'emulsion')).toBe('opposite')
    expect(formulationAffinity('alcoholic', 'emulsion')).toBe('opposite')
  })

  it('un côté inconnu : unknown (fail-open)', () => {
    expect(formulationAffinity('unknown', 'emulsion')).toBe('unknown')
    expect(formulationAffinity('wash', 'unknown')).toBe('unknown')
    expect(formulationAffinity(null, 'wash')).toBe('unknown')
  })

  it('accepte des objets Formulation (bout en bout sur INCI réels)', () => {
    const creme = classifyFormulation('AQUA, GLYCERIN, CETEARYL ALCOHOL, CAPRYLIC/CAPRIC TRIGLYCERIDE')
    const huile = classifyFormulation('CAPRYLIC/CAPRIC TRIGLYCERIDE, PRUNUS AMYGDALUS DULCIS OIL')
    const serum = classifyFormulation('AQUA, GLYCERIN, SODIUM HYALURONATE, PANTHENOL')
    const gelDouche = classifyFormulation('AQUA, SODIUM LAURETH SULFATE, COCAMIDOPROPYL BETAINE')
    const pain = classifyFormulation('SODIUM PALMATE, SODIUM PALM KERNELATE, AQUA, GLYCERIN')
    expect(formulationAffinity(creme, huile)).toBe('opposite')
    expect(formulationAffinity(creme, serum)).toBe('near')
    expect(formulationAffinity(gelDouche, pain)).toBe('opposite')
  })

  it('affinityRank : same 0, near et unknown 1, opposite 2', () => {
    expect(affinityRank('same')).toBe(0)
    expect(affinityRank('near')).toBe(1)
    expect(affinityRank('unknown')).toBe(1)
    expect(affinityRank('opposite')).toBe(2)
  })
})

describe('copie serveur (Edge Functions Deno)', () => {
  it('supabase/functions/_shared/formulation.ts est STRICTEMENT identique au module client', () => {
    const root = join(__dirname, '..', '..')
    const client = readFileSync(join(root, 'lib', 'inci', 'formulation.ts'), 'utf8')
    const server = readFileSync(join(root, 'supabase', 'functions', '_shared', 'formulation.ts'), 'utf8')
    expect(server).toBe(client)
  })

  it('aucun import (module autonome, compatible Deno sans alias @/)', () => {
    const root = join(__dirname, '..', '..')
    const client = readFileSync(join(root, 'lib', 'inci', 'formulation.ts'), 'utf8')
    expect(/^import /m.test(client)).toBe(false)
  })
})
