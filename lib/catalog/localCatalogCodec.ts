/**
 * Codec de normalisation pour le catalogue local (Phase 5 / Tier 3).
 *
 * OBJECTIF "PAREIL" : les analyses affichées hors-ligne doivent être STRICTEMENT
 * identiques à celles du serveur. On ne RECALCULE jamais : on copie le
 * `result_json.items` précalculé par l'Edge Function `analyser`, mais sous une
 * forme compacte (normalisée) pour tenir dans ~50 Mo au lieu de ~1,5 Go.
 *
 * Principe :
 *   - Les champs PAR INGRÉDIENT (name, colorRating, tags, allFunctions,
 *     translationFr, casNumber, primaryFunction, dbColorRating) sont identiques
 *     pour un même `slug` → stockés UNE fois dans un dictionnaire (15 723 entrées).
 *   - Les champs PAR PRODUIT (input, matchKind, confidence, thresholdLabel,
 *     thresholdContext) restent par produit, mais omis quand ils valent la
 *     valeur par défaut (input==name, matchKind=="exact", confidence==1, null).
 *   - `position` = index dans le tableau (implicite, non stocké).
 *   - Un ingrédient sans `slug` (non matché) est stocké INLINE intégralement.
 *
 * `decodeItems(encodeItems(items)) deepEquals items` → garanti par les tests.
 * Si ce round-trip passe, l'analyse locale est byte-identique au serveur.
 */

/** Item d'analyse tel que stocké dans `result_json.items` (forme serveur). */
export interface AnalysisItem {
  name: string
  slug: string | null
  tags: string[]
  input: string
  position: number
  casNumber: string | null
  matchKind: string
  confidence: number
  colorRating: string | null
  allFunctions: string[]
  dbColorRating: string | null
  translationFr: string | null
  thresholdLabel: string | null
  primaryFunction: string | null
  thresholdContext: string | null
}

/** Entrée de dictionnaire : champs STABLES par ingrédient (clé = slug). */
export interface DictEntry {
  name: string
  slug: string
  tags: string[]
  casNumber: string | null
  colorRating: string | null
  allFunctions: string[]
  dbColorRating: string | null
  translationFr: string | null
  primaryFunction: string | null
}

/**
 * Item compact par produit :
 *  - `d` = index dans le dictionnaire (ingrédient matché), OU
 *  - `raw` = item inline complet (ingrédient sans slug, non matché).
 *  - overrides par produit, présents uniquement si ≠ valeur par défaut.
 */
export interface EncodedItem {
  d?: number
  input?: string
  matchKind?: string
  confidence?: number
  thresholdLabel?: string | null
  thresholdContext?: string | null
  raw?: AnalysisItem
}

const DEFAULT_MATCH_KIND = 'exact'
const DEFAULT_CONFIDENCE = 1

/** Construit l'entrée de dictionnaire (champs par ingrédient) depuis un item. */
export function dictEntryFromItem(item: AnalysisItem): DictEntry {
  return {
    name: item.name,
    slug: item.slug as string,
    tags: item.tags,
    casNumber: item.casNumber,
    colorRating: item.colorRating,
    allFunctions: item.allFunctions,
    dbColorRating: item.dbColorRating,
    translationFr: item.translationFr,
    primaryFunction: item.primaryFunction,
  }
}

/**
 * Encode un item produit en s'appuyant sur le dictionnaire (slug → index).
 * Si le slug n'est pas dans le dictionnaire (ou null), on stocke l'item inline.
 */
export function encodeItem(item: AnalysisItem, slugToIndex: Map<string, number>): EncodedItem {
  const idx = item.slug != null ? slugToIndex.get(item.slug) : undefined
  if (idx === undefined) {
    return { raw: item }
  }
  const enc: EncodedItem = { d: idx }
  if (item.input !== item.name) enc.input = item.input
  if (item.matchKind !== DEFAULT_MATCH_KIND) enc.matchKind = item.matchKind
  if (item.confidence !== DEFAULT_CONFIDENCE) enc.confidence = item.confidence
  if (item.thresholdLabel !== null) enc.thresholdLabel = item.thresholdLabel
  if (item.thresholdContext !== null) enc.thresholdContext = item.thresholdContext
  return enc
}

/** Décode un item compact (index dans le tableau → position 1-based). */
export function decodeItem(
  enc: EncodedItem,
  dict: DictEntry[],
  index: number,
): AnalysisItem {
  if (enc.raw !== undefined) {
    // Item inline : on restaure tel quel, en réaffirmant la position.
    return { ...enc.raw, position: index + 1 }
  }
  const entry = dict[enc.d as number]
  return {
    name: entry.name,
    slug: entry.slug,
    tags: entry.tags,
    input: enc.input ?? entry.name,
    position: index + 1,
    casNumber: entry.casNumber,
    matchKind: enc.matchKind ?? DEFAULT_MATCH_KIND,
    confidence: enc.confidence ?? DEFAULT_CONFIDENCE,
    colorRating: entry.colorRating,
    allFunctions: entry.allFunctions,
    dbColorRating: entry.dbColorRating,
    translationFr: entry.translationFr,
    thresholdLabel: enc.thresholdLabel ?? null,
    primaryFunction: entry.primaryFunction,
    thresholdContext: enc.thresholdContext ?? null,
  }
}

/** Encode la liste d'items d'un produit. */
export function encodeItems(
  items: AnalysisItem[],
  slugToIndex: Map<string, number>,
): EncodedItem[] {
  return items.map((it) => encodeItem(it, slugToIndex))
}

/** Décode la liste d'items d'un produit (reconstruit byte-identique au serveur). */
export function decodeItems(encoded: EncodedItem[], dict: DictEntry[]): AnalysisItem[] {
  return encoded.map((enc, i) => decodeItem(enc, dict, i))
}
