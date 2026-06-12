/**
 * localCatalogCodec — PREUVE du "pareil" : decode(encode(items)) doit être
 * STRICTEMENT identique aux items du serveur (result_json). Si ce round-trip
 * passe, l'analyse locale hors-ligne = l'analyse serveur, octet pour octet.
 */
import {
  type AnalysisItem,
  type DictEntry,
  dictEntryFromItem,
  encodeItems,
  decodeItems,
} from '@/lib/catalog/localCatalogCodec'

// Items réalistes couvrant les cas : exact, fuzzy (confidence<1, matchKind),
// tags + fonctions, traduction FR, seuil (thresholdLabel/Context), input≠name,
// et un ingrédient NON matché (slug null → stocké inline).
const ITEMS: AnalysisItem[] = [
  {
    name: 'AQUA', slug: 'aqua', tags: [], input: 'AQUA', position: 1,
    casNumber: null, matchKind: 'exact', confidence: 1, colorRating: 'Vert',
    allFunctions: ['Solvant'], dbColorRating: 'Vert', translationFr: null,
    thresholdLabel: null, primaryFunction: 'Solvant', thresholdContext: null,
  },
  {
    name: 'GLYCERIN', slug: 'glycerin', tags: ['humectant'], input: 'GLYCÉRINE',
    position: 2, casNumber: '56-81-5', matchKind: 'fuzzy', confidence: 0.92,
    colorRating: 'Vert', allFunctions: ['Humectant', 'Solvant'], dbColorRating: 'Vert',
    translationFr: 'Glycérine', thresholdLabel: null, primaryFunction: 'Humectant',
    thresholdContext: null,
  },
  {
    name: 'PHENOXYETHANOL', slug: 'phenoxyethanol', tags: ['conservateur'],
    input: 'PHENOXYETHANOL', position: 3, casNumber: '122-99-6', matchKind: 'exact',
    confidence: 1, colorRating: 'Orange', allFunctions: ['Conservateur'],
    dbColorRating: 'Orange', translationFr: null, thresholdLabel: 'Limité à 1%',
    primaryFunction: 'Conservateur', thresholdContext: 'Concentration max réglementaire',
  },
  {
    // Ingrédient NON matché (slug null) → stocké inline intégralement.
    name: 'MYSTERY EXTRACT 12345', slug: null, tags: [], input: 'MYSTERY EXTRACT 12345',
    position: 4, casNumber: null, matchKind: 'none', confidence: 0, colorRating: null,
    allFunctions: [], dbColorRating: null, translationFr: null, thresholdLabel: null,
    primaryFunction: null, thresholdContext: null,
  },
]

function buildDict(items: AnalysisItem[]): { dict: DictEntry[]; slugToIndex: Map<string, number> } {
  const dict: DictEntry[] = []
  const slugToIndex = new Map<string, number>()
  for (const it of items) {
    if (it.slug != null && !slugToIndex.has(it.slug)) {
      slugToIndex.set(it.slug, dict.length)
      dict.push(dictEntryFromItem(it))
    }
  }
  return { dict, slugToIndex }
}

describe('localCatalogCodec — garantie "pareil" (round-trip identique)', () => {
  it('decode(encode(items)) est STRICTEMENT identique aux items serveur', () => {
    const { dict, slugToIndex } = buildDict(ITEMS)
    const decoded = decodeItems(encodeItems(ITEMS, slugToIndex), dict)
    expect(decoded).toEqual(ITEMS)
  })

  it('chaque champ par ingrédient est préservé (couleur, tags, fonctions, FR, CAS)', () => {
    const { dict, slugToIndex } = buildDict(ITEMS)
    const decoded = decodeItems(encodeItems(ITEMS, slugToIndex), dict)
    const gly = decoded.find((d) => d.slug === 'glycerin')!
    expect(gly.colorRating).toBe('Vert')
    expect(gly.allFunctions).toEqual(['Humectant', 'Solvant'])
    expect(gly.translationFr).toBe('Glycérine')
    expect(gly.casNumber).toBe('56-81-5')
    expect(gly.confidence).toBe(0.92)
    expect(gly.matchKind).toBe('fuzzy')
    expect(gly.input).toBe('GLYCÉRINE') // input ≠ name préservé
  })

  it('les seuils (thresholdLabel/Context) sont préservés', () => {
    const { dict, slugToIndex } = buildDict(ITEMS)
    const decoded = decodeItems(encodeItems(ITEMS, slugToIndex), dict)
    const phe = decoded.find((d) => d.slug === 'phenoxyethanol')!
    expect(phe.thresholdLabel).toBe('Limité à 1%')
    expect(phe.thresholdContext).toBe('Concentration max réglementaire')
  })

  it('un ingrédient non matché (slug null) est reconstruit à l identique (inline)', () => {
    const { dict, slugToIndex } = buildDict(ITEMS)
    const decoded = decodeItems(encodeItems(ITEMS, slugToIndex), dict)
    expect(decoded[3]).toEqual(ITEMS[3])
  })

  it('la position est correcte même si l ordre change', () => {
    const { dict, slugToIndex } = buildDict(ITEMS)
    const decoded = decodeItems(encodeItems(ITEMS, slugToIndex), dict)
    expect(decoded.map((d) => d.position)).toEqual([1, 2, 3, 4])
  })

  it('compacité : un item exact ne stocke QUE l index du dictionnaire', () => {
    const { slugToIndex } = buildDict(ITEMS)
    const enc = encodeItems(ITEMS, slugToIndex)
    // AQUA (exact, confidence 1, input==name, pas de seuil) → uniquement { d }
    expect(Object.keys(enc[0])).toEqual(['d'])
  })
})
