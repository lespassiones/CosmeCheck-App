/**
 * Écrit un brouillon d'onboarding dans le profil de la personne connectée.
 *
 * Appelé dans deux cas :
 *   - `OnboardingDraftFlusher` (racine de l'app), dès qu'une session apparaît
 *     alors qu'un parcours invité est terminé ;
 *   - la fin du parcours en mode `member` (déjà connecté).
 *
 * Le cache React Query du profil est mis à jour de façon OPTIMISTE et
 * SYNCHRONE avant l'écriture réseau : l'AuthGuard voit `onboardingShown` dans
 * le même tick et enchaîne vers le paywall sans renvoyer au questionnaire.
 */

import type { QueryClient } from '@tanstack/react-query'

import { db } from '@/lib/supabase/client'
import type { UserProfileRow } from '@/lib/supabase/types'
import { phCapture } from '@/lib/analytics/posthog'
import { registerPushToken } from '@/lib/notifications/pushToken'
import { buildOnboardingPreferences } from '@/lib/onboarding/buildPreferences'
import { clearDraft, type OnboardingDraft } from '@/lib/onboarding/draft'

function asPrefs(p: unknown): Record<string, unknown> {
  return p && typeof p === 'object' && !Array.isArray(p) ? (p as Record<string, unknown>) : {}
}

async function readProfile(
  userId: string,
  queryClient: QueryClient,
): Promise<UserProfileRow | null> {
  const cached = queryClient.getQueryData<UserProfileRow | null>(['profile', userId])
  if (cached) return cached
  const { data } = await db()
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()
  return (data as UserProfileRow | null) ?? null
}

export async function applyOnboardingDraft(params: {
  userId: string
  draft: OnboardingDraft
  queryClient: QueryClient
}): Promise<void> {
  const { userId, draft, queryClient } = params
  const row = await readProfile(userId, queryClient)
  const next = buildOnboardingPreferences(
    asPrefs(row?.preferences),
    draft,
    new Date().toISOString(),
  )
  const firstName = draft.firstName?.trim() || null
  const nextPreferences = next as UserProfileRow['preferences']

  queryClient.setQueryData<UserProfileRow | null>(['profile', userId], (old) =>
    old
      ? { ...old, preferences: nextPreferences, first_name: firstName ?? old.first_name }
      : ({ id: userId, preferences: nextPreferences, first_name: firstName } as UserProfileRow),
  )

  const payload: Record<string, unknown> = { id: userId, preferences: next }
  if (firstName) payload.first_name = firstName
  const { error } = await db()
    .from('user_profiles')
    .upsert(payload as never)
  if (error) throw error

  // Effets de bord best-effort : aucun ne doit faire échouer la fin du parcours.
  if (draft.notifications === 'granted') void registerPushToken().catch(() => {})
  if (draft.consent?.granted) {
    phCapture('data_consent_granted', { version: draft.consent.version, flow: 'perle' })
  }
  phCapture('onboarding_completed', {
    flow: 'perle',
    consent: draft.consent?.granted === true,
    scanned: Boolean(draft.scanned),
  })

  await clearDraft()
}
