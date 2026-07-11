/**
 * useProfile — profil utilisateur (table cosme_check.user_profiles).
 *
 * Le profil beauté (`skin`), le flag onboarding (`onboardingShown`) et les
 * restrictions (`restrictions`) vivent tous DANS la colonne jsonb
 * `preferences`. Ce hook lit la ligne, dérive les vues métier, et fournit des
 * mutations qui mergent SANS écraser les autres clés de `preferences`.
 *
 * Interface fournie au CORE de l'app (voir AuthGuard dans app/_layout.tsx).
 */

import { useCallback, useMemo, useState } from 'react'
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { phCapture } from '@/lib/analytics/posthog'

import { db } from '@/lib/supabase/client'
import type { UserProfileRow, UserRestrictions } from '@/lib/supabase/types'
import { readRestrictions } from '@/lib/supabase/types'
import {
  isProfileComplete as computeProfileComplete,
  readOnboardingShown,
  readSkinProfile,
  type SkinProfile,
} from '@/lib/skin/profile'
import { useAuth } from '@/hooks/useAuth'
import { showToast } from '@/components/shared/Toast'

interface UseProfileReturn {
  profile: UserProfileRow | null
  skin: SkinProfile
  restrictions: UserRestrictions
  firstName: string | null
  isLoading: boolean
  isSaving: boolean
  isProfileComplete: boolean
  onboardingShown: boolean
  paywallShown: boolean
  error: string | null
  saveSkin: (patch: Partial<SkinProfile>) => Promise<void>
  markOnboardingShown: () => Promise<void>
  /**
   * Termine l'onboarding en UNE seule écriture : merge le dernier patch skin
   * (optionnel) + `onboardingShown: true`. Met à jour le cache de façon
   * OPTIMISTE et SYNCHRONE (avant le premier await) pour que l'AuthGuard ne
   * rebondisse pas vers l'onboarding pendant que la requête réseau est en vol.
   */
  completeOnboarding: (patch?: Partial<SkinProfile>) => Promise<void>
  updateProfile: (updates: Record<string, unknown>) => Promise<void>
  refresh: () => void
}

/** Lit `preferences` comme un objet exploitable (jamais null). */
function asPrefsObject(
  preferences: UserProfileRow['preferences'] | undefined,
): Record<string, unknown> {
  if (preferences && typeof preferences === 'object' && !Array.isArray(preferences)) {
    return preferences as Record<string, unknown>
  }
  return {}
}

export function useProfile(): UseProfileReturn {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const queryClient = useQueryClient()
  const [saveError, setSaveError] = useState<string | null>(null)

  const queryKey = useMemo(() => ['profile', userId] as const, [userId])

  const {
    data: profile,
    isLoading,
    error: queryError,
    refetch,
  } = useQuery<UserProfileRow | null>({
    queryKey,
    enabled: Boolean(userId),
    staleTime: 10 * 60 * 1000, // 10 min — le profil change rarement
    queryFn: async () => {
      if (!userId) return null
      const { data, error } = await db()
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle()
      if (error) throw error
      return (data as UserProfileRow | null) ?? null
    },
  })

  const prefs = useMemo(
    () => asPrefsObject(profile?.preferences),
    [profile?.preferences],
  )

  const skin = useMemo(() => readSkinProfile(prefs), [prefs])
  const restrictions = useMemo(() => readRestrictions(prefs), [prefs])
  const onboardingShown = useMemo(() => readOnboardingShown(prefs), [prefs])
  const paywallShown = useMemo(() => {
    const val = prefs.paywall_shown
    return typeof val === 'boolean' ? val : false
  }, [prefs])
  const isProfileComplete = useMemo(
    () => computeProfileComplete(skin),
    [skin],
  )

  const firstName = useMemo<string | null>(() => {
    const fromProfile = profile?.first_name?.trim()
    if (fromProfile) return fromProfile
    const meta = user?.user_metadata as { first_name?: unknown } | undefined
    const fromMeta = typeof meta?.first_name === 'string' ? meta.first_name.trim() : ''
    return fromMeta.length > 0 ? fromMeta : null
  }, [profile?.first_name, user?.user_metadata])

  /**
   * Upsert d'un nouvel objet `preferences` complet (déjà mergé), en
   * réutilisant l'`id` de l'utilisateur. Upsert (et non update) au cas où la
   * ligne n'existerait pas encore. Met à jour le cache local après succès.
   */
  const mutation = useMutation<UserProfileRow, Error, Record<string, unknown>>({
    mutationFn: async (nextPrefs) => {
      if (!userId) throw new Error('Utilisateur non authentifié')
      const { data, error } = await db()
        .from('user_profiles')
        .upsert({ id: userId, preferences: nextPrefs })
        .select('*')
        .single()
      if (error) throw error
      return data as UserProfileRow
    },
    onSuccess: (row) => {
      setSaveError(null)
      queryClient.setQueryData<UserProfileRow | null>(queryKey, row)
    },
    onError: (err) => {
      setSaveError(err.message)
      showToast('Enregistrement impossible. Réessaie.', 'error')
    },
  })

  const saveSkin = useCallback(
    async (patch: Partial<SkinProfile>) => {
      if (!userId) return
      const current = asPrefsObject(
        queryClient.getQueryData<UserProfileRow | null>(queryKey)?.preferences ??
          profile?.preferences,
      )
      const currentSkin =
        current.skin && typeof current.skin === 'object'
          ? (current.skin as Record<string, unknown>)
          : {}
      const next: Record<string, unknown> = {
        ...current,
        skin: { ...currentSkin, ...patch },
      }
      await mutation.mutateAsync(next)
    },
    [userId, queryClient, queryKey, profile?.preferences, mutation],
  )

  const markOnboardingShown = useCallback(async () => {
    if (!userId) return
    const current = asPrefsObject(
      queryClient.getQueryData<UserProfileRow | null>(queryKey)?.preferences ??
        profile?.preferences,
    )
    const next: Record<string, unknown> = { ...current, onboardingShown: true }
    await mutation.mutateAsync(next)
  }, [userId, queryClient, queryKey, profile?.preferences, mutation])

  const completeOnboarding = useCallback(
    async (patch?: Partial<SkinProfile>) => {
      if (!userId) return
      const current = asPrefsObject(
        queryClient.getQueryData<UserProfileRow | null>(queryKey)?.preferences ??
          profile?.preferences,
      )
      const currentSkin =
        current.skin && typeof current.skin === 'object'
          ? (current.skin as Record<string, unknown>)
          : {}
      const next: Record<string, unknown> = {
        ...current,
        skin: { ...currentSkin, ...(patch ?? {}) },
        onboardingShown: true,
      }
      // Optimiste + SYNCHRONE : le flag est vrai dans le cache immédiatement,
      // avant toute navigation, donc l'AuthGuard ne renvoie pas à l'onboarding.
      const nextPreferences = next as UserProfileRow['preferences']
      queryClient.setQueryData<UserProfileRow | null>(queryKey, (old) =>
        old
          ? { ...old, preferences: nextPreferences }
          : ({ id: userId, preferences: nextPreferences } as UserProfileRow),
      )
      // Persistance réseau (une seule écriture, pas de course concurrente).
      await mutation.mutateAsync(next)
      phCapture('onboarding_completed')
    },
    [userId, queryClient, queryKey, profile?.preferences, mutation],
  )

  const updateProfile = useCallback(
    async (updates: Record<string, unknown>) => {
      if (!userId) return
      const current = asPrefsObject(
        queryClient.getQueryData<UserProfileRow | null>(queryKey)?.preferences ??
          profile?.preferences,
      )
      const next: Record<string, unknown> = { ...current, ...updates }
      await mutation.mutateAsync(next)
    },
    [userId, queryClient, queryKey, profile?.preferences, mutation],
  )

  const refresh = useCallback(() => {
    void refetch()
  }, [refetch])

  const error = saveError ?? (queryError instanceof Error ? queryError.message : null)

  return {
    profile: profile ?? null,
    skin,
    restrictions,
    firstName,
    isLoading,
    isSaving: mutation.isPending,
    isProfileComplete,
    onboardingShown,
    paywallShown,
    error,
    saveSkin,
    markOnboardingShown,
    completeOnboarding,
    updateProfile,
    refresh,
  }
}
