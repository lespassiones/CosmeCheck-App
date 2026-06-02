/**
 * Local Storage Wrappers — implémentation AsyncStorage.
 *
 * RÔLE:
 *   Wrappers AsyncStorage pour la persistance locale non-sensible.
 *   Gère les clés de session temporaires comme l'INCI en attente,
 *   la source du scan, la dernière analyse et le cache des analyses.
 *
 * CLÉS ASYNCSTORAGE:
 *   - 'cosmecheck:pending_inci' — texte INCI en attente d'analyse
 *   - 'cosmecheck:pending_source' — source du scan ('barcode'|'ocr'|'search'|'manual')
 *   - 'cosmecheck:pending_product_name' — nom produit associé au scan en cours
 *   - 'cosmecheck:last_analysis_id' — UUID de la dernière analyse
 *   - 'cosmecheck:analysis_cache' — JSON: { [id]: { data: AnalyseResponse, cachedAt: timestamp } }
 *   - 'cosmecheck:analysis_row_cache' — JSON: { [id]: { data: AnalysisRow, cachedAt: timestamp } }
 *
 * TTL cache analyses : 24 heures.
 */

import AsyncStorage from '@react-native-async-storage/async-storage'
import type { AnalyseResponse } from '../analysis/types'
import type { AnalysisRow } from '../supabase/types'
import { isFresh, parseCacheMap, purgeExpired, type TimestampedEntry } from './cacheCore'

type AnalysisSource = 'barcode' | 'ocr' | 'search' | 'manual' | 'link'

const K_PENDING_INCI = 'cosmecheck:pending_inci'
const K_PENDING_SOURCE = 'cosmecheck:pending_source'
const K_PENDING_PRODUCT_NAME = 'cosmecheck:pending_product_name'
const K_LAST_ANALYSIS_ID = 'cosmecheck:last_analysis_id'
const K_ANALYSIS_CACHE = 'cosmecheck:analysis_cache'
const K_ANALYSIS_ROW_CACHE = 'cosmecheck:analysis_row_cache'

const TTL_MS = 24 * 60 * 60 * 1000 // 24 heures

type CacheEntry = TimestampedEntry<AnalyseResponse>
type CacheMap = Record<string, CacheEntry>
type RowCacheEntry = TimestampedEntry<AnalysisRow>
type RowCacheMap = Record<string, RowCacheEntry>

const SOURCES: ReadonlySet<AnalysisSource> = new Set<AnalysisSource>([
  'barcode',
  'ocr',
  'search',
  'manual',
  'link',
])

function isSource(v: string | null): v is AnalysisSource {
  return v != null && SOURCES.has(v as AnalysisSource)
}

async function readCacheMap(): Promise<CacheMap> {
  const raw = await AsyncStorage.getItem(K_ANALYSIS_CACHE)
  return parseCacheMap<AnalyseResponse>(raw)
}

async function writeCacheMap(map: CacheMap): Promise<void> {
  await AsyncStorage.setItem(K_ANALYSIS_CACHE, JSON.stringify(map))
}

async function readRowCacheMap(): Promise<RowCacheMap> {
  const raw = await AsyncStorage.getItem(K_ANALYSIS_ROW_CACHE)
  return parseCacheMap<AnalysisRow>(raw)
}

async function writeRowCacheMap(map: RowCacheMap): Promise<void> {
  await AsyncStorage.setItem(K_ANALYSIS_ROW_CACHE, JSON.stringify(map))
}

/**
 * Sauvegarde l'INCI en attente avant navigation vers ScanSheet/analyse.
 */
export async function setPendingInci(
  inci: string,
  source: AnalysisSource,
  productName?: string
): Promise<void> {
  const ops: Promise<void>[] = [
    AsyncStorage.setItem(K_PENDING_INCI, inci),
    AsyncStorage.setItem(K_PENDING_SOURCE, source),
  ]
  if (productName != null && productName.length > 0) {
    ops.push(AsyncStorage.setItem(K_PENDING_PRODUCT_NAME, productName))
  } else {
    ops.push(AsyncStorage.removeItem(K_PENDING_PRODUCT_NAME))
  }
  await Promise.all(ops)
}

/**
 * Récupère l'INCI en attente (pour reprendre après un crash/fond).
 */
export async function getPendingInci(): Promise<{
  inci: string | null
  source: AnalysisSource | null
  productName: string | null
}> {
  const [inci, source, productName] = await AsyncStorage.multiGet([
    K_PENDING_INCI,
    K_PENDING_SOURCE,
    K_PENDING_PRODUCT_NAME,
  ]).then((pairs) => pairs.map(([, v]) => v))

  return {
    inci: inci ?? null,
    source: isSource(source ?? null) ? (source as AnalysisSource) : null,
    productName: productName ?? null,
  }
}

/**
 * Efface les données d'analyse en attente après complétion.
 */
export async function clearPendingInci(): Promise<void> {
  await AsyncStorage.multiRemove([
    K_PENDING_INCI,
    K_PENDING_SOURCE,
    K_PENDING_PRODUCT_NAME,
  ])
}

/**
 * Sauvegarde le dernier ID d'analyse pour accès rapide depuis le Dashboard.
 */
export async function setLastAnalysisId(id: string): Promise<void> {
  await AsyncStorage.setItem(K_LAST_ANALYSIS_ID, id)
}

export async function getLastAnalysisId(): Promise<string | null> {
  return (await AsyncStorage.getItem(K_LAST_ANALYSIS_ID)) ?? null
}

/**
 * Cache une analyse localement avec timestamp. TTL: 24 heures.
 */
export async function cacheAnalysis(id: string, data: AnalyseResponse): Promise<void> {
  const map = await readCacheMap()
  map[id] = { data, cachedAt: Date.now() }
  await writeCacheMap(map)
}

/**
 * Récupère une analyse du cache si elle existe et n'est pas expirée.
 * Si l'entrée est expirée, elle est purgée au passage.
 */
export async function getCachedAnalysis(id: string): Promise<AnalyseResponse | null> {
  const map = await readCacheMap()
  const entry = map[id]
  if (!entry) return null
  if (isFresh(entry.cachedAt, Date.now(), TTL_MS)) {
    return entry.data
  }
  delete map[id]
  await writeCacheMap(map)
  return null
}

/**
 * Cache une ligne `analyses` (row complet) localement avec timestamp.
 * Sert à l'écran de détail pour éviter un fetch DB sur ré-ouverture.
 */
export async function cacheAnalysisRow(row: AnalysisRow): Promise<void> {
  const map = await readRowCacheMap()
  map[row.id] = { data: row, cachedAt: Date.now() }
  await writeRowCacheMap(map)
}

/**
 * Récupère une ligne `analyses` du cache si elle existe et est fraîche.
 * Purge l'entrée si expirée.
 */
export async function getCachedAnalysisRow(id: string): Promise<AnalysisRow | null> {
  const map = await readRowCacheMap()
  const entry = map[id]
  if (!entry) return null
  if (isFresh(entry.cachedAt, Date.now(), TTL_MS)) {
    return entry.data
  }
  delete map[id]
  await writeRowCacheMap(map)
  return null
}

/**
 * Invalide une ligne `analyses` du cache local (à appeler après suppression /
 * renommage côté DB pour éviter qu'un détail ne s'affiche stale).
 */
export async function invalidateCachedAnalysisRow(id: string): Promise<void> {
  const map = await readRowCacheMap()
  if (map[id]) {
    delete map[id]
    await writeRowCacheMap(map)
  }
}

/**
 * Nettoie le cache des analyses expirées (appelé au démarrage).
 */
export async function clearExpiredCache(): Promise<void> {
  const now = Date.now()
  const [respMap, rowMap] = await Promise.all([readCacheMap(), readRowCacheMap()])
  const respPurge = purgeExpired(respMap, now, TTL_MS)
  const rowPurge = purgeExpired(rowMap, now, TTL_MS)
  const ops: Promise<void>[] = []
  if (respPurge.mutated) ops.push(writeCacheMap(respPurge.map))
  if (rowPurge.mutated) ops.push(writeRowCacheMap(rowPurge.map))
  if (ops.length > 0) await Promise.all(ops)
}
