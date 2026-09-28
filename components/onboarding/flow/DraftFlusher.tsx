/**
 * OnboardingDraftFlusher : écrit les réponses du parcours invité dès qu'une
 * session apparaît (inscription e-mail, Google, Apple, ou connexion).
 *
 * Monté une fois à la racine (`app/_layout.tsx`), comme `CacheJanitor`. Tant
 * qu'un brouillon terminé attend d'être écrit, `isDraftPendingFlush()` est vrai
 * et l'AuthGuard s'abstient. Si l'écriture échoue (réseau), on cesse de bloquer
 * le guard : il enverra vers le parcours en mode connecté, qui reprend depuis
 * ce même brouillon et retentera l'écriture à la fin.
 */

import { useEffect, useRef, useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/hooks/useAuth'
import { applyOnboardingDraft } from '@/lib/onboarding/applyDraft'
import {
  getDraft,
  isDraftPendingFlush,
  loadDraft,
  markDraftFlushFailed,
  subscribeDraft,
} from '@/lib/onboarding/draft'

export function OnboardingDraftFlusher(): null {
  const { user, isAuthenticated } = useAuth()
  const queryClient = useQueryClient()
  const pending = useSyncExternalStore(subscribeDraft, isDraftPendingFlush, isDraftPendingFlush)
  const inFlight = useRef(false)

  useEffect(() => {
    void loadDraft()
  }, [])

  useEffect(() => {
    const draft = getDraft()
    if (!isAuthenticated || !user?.id || !pending || !draft || inFlight.current) return
    inFlight.current = true
    void applyOnboardingDraft({ userId: user.id, draft, queryClient })
      .catch(() => markDraftFlushFailed())
      .finally(() => {
        inFlight.current = false
      })
  }, [isAuthenticated, user?.id, pending, queryClient])

  return null
}
