/**
 * Branchement du ménage mémoire (règles : `lib/storage/queryJanitor.ts`).
 * Appelé une fois au chargement de app/_layout.tsx, pour toute la vie de l'app.
 */
import { AppState } from 'react-native'
import type { QueryClient } from '@tanstack/react-query'
import { Image } from 'expo-image'

import { NON_PERSISTED_ROOT_KEYS } from '@/lib/storage/queryPersist'
import {
  PRUNE_EVERY_MS,
  TRANSIENT_GC_MS,
  selectEvictions,
  type CacheEntryInfo,
} from '@/lib/storage/queryJanitor'

let started = false

export function startQueryCacheJanitor(client: QueryClient): void {
  if (started) return
  started = true

  // Requêtes transitoires : quittent la mémoire TRANSIENT_GC_MS après leur
  // dernier usage (gcTime natif), au lieu des 7 jours du défaut global.
  for (const key of NON_PERSISTED_ROOT_KEYS) {
    client.setQueryDefaults([key], { gcTime: TRANSIENT_GC_MS })
  }

  const prune = (aggressive = false) => {
    try {
      const cache = client.getQueryCache()
      const all = cache.getAll()
      const infos: CacheEntryInfo[] = all.map((q) => ({
        hash: q.queryHash,
        rootKey: typeof q.queryKey[0] === 'string' ? q.queryKey[0] : null,
        active: q.getObserversCount() > 0,
        fetching: q.state.fetchStatus === 'fetching',
        updatedAt: q.state.dataUpdatedAt || q.state.errorUpdatedAt || 0,
      }))
      const drop = new Set(selectEvictions(infos, { now: Date.now(), aggressive }))
      if (drop.size === 0) return
      for (const q of all) if (drop.has(q.queryHash)) cache.remove(q)
    } catch {
      // Jamais bloquant : au pire la mémoire n'est pas allégée cette fois-ci.
    }
  }

  let timer: ReturnType<typeof setInterval> | null = setInterval(prune, PRUNE_EVERY_MS)
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      if (!timer) timer = setInterval(prune, PRUNE_EVERY_MS)
      return
    }
    // Passage en arrière-plan : on allège tout de suite et on arrête le minuteur.
    prune()
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  })
  // Le système manque de mémoire : tout ce qui n'est pas affiché est libéré.
  AppState.addEventListener('memoryWarning', () => {
    prune(true)
    void Image.clearMemoryCache().catch(() => {})
  })
}
