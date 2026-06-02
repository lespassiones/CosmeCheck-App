/**
 * productImageCache — cache local des URLs d'image produit, keyed par
 * `analysis_id`.
 *
 * Le schéma `analyses` n'a pas de colonne `image_url`, donc on stocke ici
 * l'URL côté client après qu'un produit a été choisi depuis le catalogue,
 * un scan code-barres, ou un Coller-le-lien. L'écran d'analyse lit ce cache
 * au montage pour pré-remplir l'illustration du produit dans BigScoreCard.
 *
 * Format de stockage : map JSON `{ [analysisId]: { url, ts } }` purgée
 * périodiquement (TTL 30 jours, max 500 entrées).
 */

import AsyncStorage from '@react-native-async-storage/async-storage'

import { supabase } from '../supabase/client'

const KEY = 'cosmecheck:product_image_cache'
const TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 jours
const MAX_ENTRIES = 500

interface CacheEntry {
  url: string
  ts: number
}

type CacheMap = Record<string, CacheEntry>

async function readMap(): Promise<CacheMap> {
  try {
    const raw = await AsyncStorage.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as CacheMap
  } catch {
    return {}
  }
}

async function writeMap(map: CacheMap): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(map))
  } catch {
    /* storage indisponible, on ignore */
  }
}

/** Purge les entrées expirées et garde les MAX_ENTRIES plus récentes. */
function prune(map: CacheMap): CacheMap {
  const now = Date.now()
  const entries = Object.entries(map).filter(([, e]) => now - e.ts < TTL_MS)
  if (entries.length <= MAX_ENTRIES) {
    return Object.fromEntries(entries)
  }
  // Tri par timestamp décroissant (plus récent en premier)
  entries.sort((a, b) => b[1].ts - a[1].ts)
  return Object.fromEntries(entries.slice(0, MAX_ENTRIES))
}

/** Sauvegarde l'URL image associée à une analyse. */
export async function cacheProductImage(
  analysisId: string,
  imageUrl: string | null | undefined,
): Promise<void> {
  if (!imageUrl || imageUrl.length === 0) return
  const map = await readMap()
  map[analysisId] = { url: imageUrl, ts: Date.now() }
  await writeMap(prune(map))
}

/** Lit l'URL image cachée pour une analyse, ou null si absente/expirée. */
export async function getProductImage(analysisId: string): Promise<string | null> {
  if (!analysisId) return null
  const map = await readMap()
  const entry = map[analysisId]
  if (!entry) return null
  if (Date.now() - entry.ts > TTL_MS) return null
  return entry.url
}

interface CatalogImageRow {
  image_url: string | null
  brand?: string | null
  name?: string | null
}

/**
 * Résout l'URL image d'une analyse :
 *   1. cache local (instantané)
 *   2. fallback catalogue via RPC `cosme_check_search_catalog` (brand + name)
 *   3. cache le résultat trouvé pour les prochains affichages → 1 seul appel
 *      DB par analyse historique, puis instantané.
 *
 * Utile pour les analyses faites AVANT l'introduction du cache (ou via une
 * source qui ne portait pas d'image — ex : barcode quand l'Edge Function ne
 * renvoyait pas encore l'imageUrl). Renvoie null si le produit n'est pas dans
 * le catalogue (ex : analyse depuis photo ou paste manuel).
 */
export async function resolveAndCacheProductImage(
  analysisId: string,
  brand: string | null | undefined,
  name: string | null | undefined,
): Promise<string | null> {
  // 1. Cache hit → instantané
  const cached = await getProductImage(analysisId)
  if (cached) return cached

  // 2. Fallback catalogue : requête substring brand + name
  const query = [brand, name].filter(Boolean).join(' ').trim()
  if (query.length < 3) return null
  try {
    const { data, error } = await supabase.rpc(
      'cosme_check_search_catalog' as never,
      { p_query: query, p_limit: 1 } as never,
    )
    if (error) return null
    const rows = (data as CatalogImageRow[] | null) ?? []
    const url = rows[0]?.image_url ?? null
    if (url) {
      // 3. Cache pour la prochaine fois (1 seul appel DB par analyse historique)
      await cacheProductImage(analysisId, url)
      return url
    }
  } catch {
    return null
  }
  return null
}
