/**
 * Ménage mémoire automatique du cache React Query (invisible pour l'utilisateur).
 *
 * POURQUOI : `gcTime` vaut 7 jours (il doit couvrir l'âge max du cache disque
 * pour que la restauration au démarrage fonctionne). Conséquence : pendant une
 * session, chaque fiche, ingrédient ou recherche visités restait en mémoire
 * jusqu'à la fermeture de l'app, et la mémoire grossissait au fil de l'usage.
 *
 * RÈGLES (une requête affichée n'est JAMAIS touchée) :
 *   - requêtes transitoires (jamais persistées : recherches, alternatives,
 *     explications IA…) : libérées TRANSIENT_GC_MS après leur dernier usage ;
 *   - requêtes persistées inactives : on garde les MAX_INACTIVE_PERSISTED plus
 *     récentes, les plus anciennes sont libérées (rechargées si on y revient) ;
 *   - alerte mémoire du système : tout ce qui n'est pas affiché est libéré,
 *     plus le cache mémoire des images.
 * Le tri tourne toutes les PRUNE_EVERY_MS au premier plan et à chaque passage en
 * arrière-plan. La sélection est une fonction pure (testée).
 */
import { NON_PERSISTED_ROOT_KEYS } from '@/lib/storage/queryPersist'

export const TRANSIENT_GC_MS = 5 * 60 * 1000
export const MAX_INACTIVE_PERSISTED = 100
export const PRUNE_EVERY_MS = 3 * 60 * 1000

export interface CacheEntryInfo {
  hash: string
  rootKey: string | null
  /** Au moins un écran/hook observe la requête (affichée). */
  active: boolean
  /** Chargement en cours : on ne retire jamais une requête en vol. */
  fetching: boolean
  /** Dernière mise à jour des données (ms epoch, 0 si jamais). */
  updatedAt: number
}

export interface EvictionOptions {
  now: number
  maxInactivePersisted?: number
  transientIdleMs?: number
  /** Alerte mémoire : libère toutes les requêtes non affichées. */
  aggressive?: boolean
}

/** Hashes des requêtes à retirer de la mémoire. */
export function selectEvictions(entries: readonly CacheEntryInfo[], opts: EvictionOptions): string[] {
  const maxKeep = opts.maxInactivePersisted ?? MAX_INACTIVE_PERSISTED
  const idle = opts.transientIdleMs ?? TRANSIENT_GC_MS
  const candidates = entries.filter((e) => !e.active && !e.fetching)
  if (opts.aggressive) return candidates.map((e) => e.hash)

  const out: string[] = []
  const persisted: CacheEntryInfo[] = []
  for (const e of candidates) {
    const transient = e.rootKey == null || NON_PERSISTED_ROOT_KEYS.has(e.rootKey)
    if (transient) {
      if (opts.now - e.updatedAt >= idle) out.push(e.hash)
    } else {
      persisted.push(e)
    }
  }
  persisted.sort((a, b) => b.updatedAt - a.updatedAt)
  for (const e of persisted.slice(maxKeep)) out.push(e.hash)
  return out
}
