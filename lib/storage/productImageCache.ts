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

import { fetchProductByEan } from '@/lib/catalog/productByEan'

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

/**
 * Résout l'URL image d'une analyse :
 *   1. Cache local rapide (instantané pour analyses historiques)
 *   2. Si pas de cache, EAN (SOURCE DE VÉRITÉ) ou fallback brand+name
 *   3. Vérifie EAN EN ARRIÈRE-PLAN pour mettre à jour si changé
 *
 * NOTE: EAN est la SEULE source de vérité. Cache utilisé pour rapidité,
 * mais EAN vérifié en bg pour cohérence cross-device.
 * Utile pour les analyses faites AVANT l'introduction du cache (ou via une
 * source qui ne portait pas d'image — ex : barcode quand l'Edge Function ne
 * renvoyait pas encore l'imageUrl). Renvoie null si le produit n'est pas dans
 * le catalogue (ex : analyse depuis photo ou paste manuel).
 */
export async function resolveAndCacheProductImage(
  analysisId: string,
  ean: string | null | undefined,
  brand: string | null | undefined,
  name: string | null | undefined,
): Promise<string | null> {
  // L'IMAGE EST PILOTÉE UNIQUEMENT PAR L'EAN (PK catalogue) = SOURCE DE VÉRITÉ
  // UNIQUE. Un même EAN → une seule image, identique mobile ET web. AUCUN
  // fallback flou par marque+nom (c'était la source de divergence : un même nom
  // matchait des variantes différentes selon la plateforme).
  if (ean) {
    try {
      // Lookup dédupliqué avec resolveCatalogIdentity (même EAN au même moment
      // sur l'écran analyse) : 1 seul appel RPC partagé via React Query.
      const row = await fetchProductByEan(ean)
      if (row?.image_url) {
        await cacheProductImage(analysisId, row.image_url)
        return row.image_url
      }
    } catch {
      // Lookup EAN échoué (réseau) → on retombe sur la dernière image EAN cachée.
    }
    // EAN fourni mais lookup échoué/vide : dernière image EAN connue (cache).
    return await getProductImage(analysisId)
  }

  // Pas d'EAN (saisie manuelle / produit internet hors catalogue) : aucune image
  // déterministe possible. On NE devine PAS via marque+nom. L'écran retombe sur
  // result_json.imageUrl (valeur unique stockée, identique sur les 2 plateformes).
  // ⚠️ `name`/`brand` sont conservés dans la signature pour compat appelants.
  void brand
  void name
  return null
}
