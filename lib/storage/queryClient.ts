/**
 * QueryClient React Query partagé pour toute l'app (niveau module).
 *
 * Centralisé ici (plutôt que dans `_layout.tsx`) pour être importable hors
 * arbre React — notamment par `clearUserScopedCaches()` au sign-out.
 *
 * `gcTime` doit être >= au max-age du persister, sinon les caches sont GC'd
 * avant d'être rechargés au cold start.
 */

import { QueryClient } from '@tanstack/react-query'

import { QUERY_PERSIST_MAX_AGE_MS } from '@/lib/storage/queryPersist'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 min par défaut
      gcTime: QUERY_PERSIST_MAX_AGE_MS,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})
