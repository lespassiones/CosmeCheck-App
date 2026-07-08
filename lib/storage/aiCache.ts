/**
 * AI Edge Function Cache — wrapper AsyncStorage générique TTL-based.
 *
 * Les réponses des Edge Functions IA (ingredient-explain, compare-insights,
 * routine-suggest) sont quasi-stables pour un même input. On évite des
 * rappels coûteux en LLM en les cachant localement.
 *
 * Une cache par `namespace`, séparée des caches métier (`session.ts`) pour
 * faciliter la purge sélective et garder une responsabilité unique.
 */

import AsyncStorage from '@react-native-async-storage/async-storage'
import { isFresh, parseCacheMap, purgeExpired, type TimestampedEntry } from './cacheCore'

const PREFIX = 'cosmecheck:ai-cache:'

/**
 * Plafond d'entrées par namespace. Les caches longue durée (explain/compare,
 * TTL 30j) pourraient sinon gonfler indéfiniment (I/O + taille app). On garde
 * les N plus récentes (éviction LRU par `cachedAt`).
 */
const MAX_ENTRIES_PER_NAMESPACE = 200

/** Garde au plus `max` entrées (les plus récentes par `cachedAt`). Pur. */
export function capEntries<T>(
  map: Record<string, TimestampedEntry<T>>,
  max: number,
): Record<string, TimestampedEntry<T>> {
  const keys = Object.keys(map)
  if (keys.length <= max) return map
  const kept: Record<string, TimestampedEntry<T>> = {}
  for (const k of keys.sort((a, b) => map[b].cachedAt - map[a].cachedAt).slice(0, max)) {
    kept[k] = map[k]
  }
  return kept
}

/** Clé AsyncStorage pour un namespace donné. */
export function aiCacheStorageKey(namespace: string): string {
  return `${PREFIX}${namespace}`
}

async function readMap<T>(namespace: string): Promise<Record<string, TimestampedEntry<T>>> {
  const raw = await AsyncStorage.getItem(aiCacheStorageKey(namespace))
  return parseCacheMap<T>(raw)
}

async function writeMap<T>(
  namespace: string,
  map: Record<string, TimestampedEntry<T>>,
): Promise<void> {
  await AsyncStorage.setItem(aiCacheStorageKey(namespace), JSON.stringify(map))
}

/**
 * Lit une entrée fraîche. `null` si absente OU expirée (sans purge active —
 * c'est `clearExpiredAiCache` qui s'en charge périodiquement).
 */
export async function readAiCache<T>(
  namespace: string,
  key: string,
  ttlMs: number,
): Promise<T | null> {
  try {
    const map = await readMap<T>(namespace)
    const entry = map[key]
    if (!entry) return null
    return isFresh(entry.cachedAt, Date.now(), ttlMs) ? entry.data : null
  } catch {
    return null
  }
}

/** Écrit une entrée. Best-effort : un échec AsyncStorage est silencieux. */
export async function writeAiCache<T>(
  namespace: string,
  key: string,
  data: T,
): Promise<void> {
  try {
    const map = await readMap<T>(namespace)
    map[key] = { data, cachedAt: Date.now() }
    await writeMap(namespace, capEntries(map, MAX_ENTRIES_PER_NAMESPACE))
  } catch {
    // ignore
  }
}

/**
 * Hash déterministe d'une liste de strings (ordre-indépendant si déjà triée).
 * Sert à fabriquer la clé de cache d'une routine (analysisIds × frequencies).
 *
 * Implémentation : FNV-1a 32 bits — assez court pour une clé AsyncStorage,
 * stable et déterministe entre versions JS.
 */
export function stableHash(input: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

/**
 * Clé de cache stable pour `routine-suggest` : la signature dépend uniquement
 * de l'ensemble (analysisId, frequency) des produits, indépendamment de
 * l'ordre. Si la routine est inchangée, on retrouve la même clé → cache HIT.
 */
export function routineSuggestKey(
  products: { id: string; frequency: string }[],
): string {
  const parts = products
    .map((p) => `${p.id}:${p.frequency}`)
    .sort()
    .join('|')
  return stableHash(parts)
}

/** Clé pour `compare-insights` (ordre A→B significatif). Le préfixe de version
 *  invalide le cache local quand le prompt serveur change (ici v9 : règle de
 *  pertinence du profil) → régénération avec le texte corrigé. */
export function compareInsightsKey(aId: string, bId: string): string {
  return `v9__${aId}__${bId}`
}

/**
 * Liste fixe des namespaces de cache IA gérés par cette couche. Utilisée par
 * la purge périodique pour parcourir TOUTES les caches sans avoir besoin
 * d'introspecter AsyncStorage (`getAllKeys` est cher sur Android).
 */
export const AI_CACHE_NAMESPACES = [
  'ingredient-explain',
  'ingredient-exposure',
  'compare-insights',
  'routine-suggest',
  'routine-conflicts',
] as const

export type AiCacheNamespace = (typeof AI_CACHE_NAMESPACES)[number]

/**
 * TTL par namespace, utilisé par `clearExpiredAiCache`. Doit rester aligné
 * sur les constantes TTL_* exportées plus bas.
 */
const TTL_BY_NAMESPACE: Record<AiCacheNamespace, number> = {
  'ingredient-explain': 30 * 24 * 60 * 60 * 1000,
  'ingredient-exposure': 60 * 60 * 1000,
  'compare-insights': 30 * 24 * 60 * 60 * 1000,
  'routine-suggest': 24 * 60 * 60 * 1000,
  'routine-conflicts': 7 * 24 * 60 * 60 * 1000,
}

/**
 * Purge les entrées expirées de toutes les caches IA. Appelée au démarrage de
 * l'app (best-effort, non-bloquant). Évite que les maps AsyncStorage gonflent
 * indéfiniment, ce qui dégrade les I/O et fait monter la taille de l'app.
 */
export async function clearExpiredAiCache(now: number = Date.now()): Promise<void> {
  for (const namespace of AI_CACHE_NAMESPACES) {
    try {
      const map = await readMap<unknown>(namespace)
      if (Object.keys(map).length === 0) continue
      const ttl = TTL_BY_NAMESPACE[namespace]
      const purge = purgeExpired(map, now, ttl)
      if (purge.mutated) {
        await writeMap(namespace, purge.map)
      }
    } catch {
      // Une cache corrompue ne doit jamais bloquer le démarrage de l'app.
    }
  }
}

// ─── TTL recommandés ─────────────────────────────────────────────────────────

/** Texte d'explication d'un ingrédient : très stable. */
export const TTL_INGREDIENT_EXPLAIN_MS = 30 * 24 * 60 * 60 * 1000 // 30 jours
/** Ligne perso "présent dans X de tes produits" : dépend des analyses user. */
export const TTL_INGREDIENT_EXPOSURE_MS = 60 * 60 * 1000 // 1 heure
/** Insights de comparaison de 2 analyses : stable pour un couple donné. */
export const TTL_COMPARE_INSIGHTS_MS = 30 * 24 * 60 * 60 * 1000 // 30 jours
/** Suggestions IA de routine : laisse repartir après une journée. */
export const TTL_ROUTINE_SUGGEST_MS = 24 * 60 * 60 * 1000 // 24 heures
/** Analyse approfondie IA des conflits de routine : stable pour une routine donnée. */
export const TTL_ROUTINE_CONFLICTS_MS = 7 * 24 * 60 * 60 * 1000 // 7 jours
