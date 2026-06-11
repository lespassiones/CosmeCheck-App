/**
 * Cache React Query de la recherche catalogue.
 *
 * But : quand un même utilisateur retape une recherche équivalente, on sert le
 * résultat depuis le cache mémoire (staleTime) au lieu de rappeler la RPC
 * `cosme_check_search_catalog`. fetchQuery dédoublonne aussi les requêtes
 * en vol (deux effets pour la même clé → un seul appel réseau).
 *
 * La normalisation de la clé MIROIR la sémantique de la RPC (Phase 1) :
 * insensible à la CASSE, aux ACCENTS et à l'ORDRE des mots. Donc
 * "Garnier Crème", "creme garnier" et "CRÈME garnier" partagent une seule
 * entrée de cache → taux de hit maximal.
 *
 * Logique pure (aucune dépendance RN/AsyncStorage) → testable en env node.
 */

/** Racine de queryKey — ajoutée au blacklist du persister (transient, pas sur disque). */
export const CATALOG_SEARCH_KEY = 'catalog-search'

/** Durée pendant laquelle une recherche identique est servie sans rappeler la RPC. */
export const CATALOG_SEARCH_STALE_MS = 60_000

const DIACRITICS_RE = /[̀-ͯ]/g

/**
 * Normalise une requête en clé de cache canonique : minuscules, sans accents,
 * ponctuation → espace, mots triés. Deux requêtes sémantiquement équivalentes
 * (même mots, ordre/casse/accents différents) produisent la MÊME clé.
 */
export function normalizeSearchQuery(query: string): string {
  return query
    .toLowerCase()
    .normalize('NFD')
    .replace(DIACRITICS_RE, '')
    .replace(/[^a-z0-9+\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .sort()
    .join(' ')
}

/**
 * queryKey stable pour une page de recherche. L'offset fait partie de la clé
 * pour cacher chaque page de pagination indépendamment.
 */
export function catalogSearchKey(
  query: string,
  offset: number,
): [string, string, number] {
  return [CATALOG_SEARCH_KEY, normalizeSearchQuery(query), offset]
}
