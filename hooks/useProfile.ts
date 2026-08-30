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
  useIsRestoring,
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
import { withTimeout } from '@/lib/utils/withTimeout'

/**
 * Plafond de la lecture de profil.
 *
 * Cette requête est la TROISIÈME porte du démarrage, après les polices et la
 * session, et c'était la seule à n'être bornée par rien. React Query n'impose
 * aucun délai, et le réseau de React Native sur Android non plus (OkHttp y est
 * configuré sans `readTimeout`). Un serveur qui accepte la connexion et se tait
 * laissait donc `isLoading` vrai à vie, et l'écran d'onboarding, qui l'attend,
 * tournait indéfiniment.
 *
 * La règle est la même que pour la session : le démarrage peut finir MAL
 * RENSEIGNÉ, c'est rattrapable au prochain lancement, mais il ne peut pas NE
 * PAS FINIR. Six secondes ne coupent aucun démarrage sain.
 */
export const PROFILE_TIMEOUT_MS = 6000

interface UseProfileReturn {
  profile: UserProfileRow | null
  skin: SkinProfile
  restrictions: UserRestrictions
  firstName: string | null
  isLoading: boolean
  /** Le profil n'a pas pu être lu : ne rien déduire de son absence. */
  profileUnavailable: boolean
  isSaving: boolean
  isProfileComplete: boolean
  onboardingShown: boolean
  paywallShown: boolean
  /**
   * Consentement explicite à l'usage des données de profil (données de santé,
   * RGPD art. 9) recueilli sur l'écran `/consent`, avant le questionnaire.
   */
  dataConsentGiven: boolean
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
  /**
   * Enregistre le consentement. Optimiste et SYNCHRONE avant le premier await,
   * comme `completeOnboarding` : sinon l'AuthGuard renvoie sur l'écran de
   * consentement pendant que la requête réseau est en vol.
   */
  giveDataConsent: () => Promise<void>
  updateProfile: (updates: Record<string, unknown>) => Promise<void>
  refresh: () => void
}

/** Version du texte consenti. À incrémenter si la finalité change vraiment. */
export const DATA_CONSENT_VERSION = 1

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
    // Une seule reprise, rapprochée : au-delà on préfère un écran décidé sur
    // une information manquante à un écran qui n'arrive jamais. Pire cas de
    // bout en bout : 6 s + 0,3 s + 6 s, soit un peu plus de douze secondes.
    retry: 1,
    retryDelay: 300,
    queryFn: async () => {
      if (!userId) return null
      // `Promise.resolve` : le constructeur de requête Supabase est un
      // « thenable » paresseux, pas une vraie promesse. L'adopter ici déclenche
      // l'appel et donne à `withTimeout` le type qu'il attend.
      const { data, error } = await withTimeout(
        Promise.resolve(
          db().from('user_profiles').select('*').eq('id', userId).maybeSingle(),
        ),
        PROFILE_TIMEOUT_MS,
        'profil: délai dépassé',
      )
      if (error) throw error
      return (data as UserProfileRow | null) ?? null
    },
  })

  /**
   * Le profil n'a pas pu être lu : la requête est retombée, sans donnée, avec
   * une erreur (réseau, refus, ou délai dépassé). Ce booléen existe pour que le
   * routage puisse s'ABSTENIR de déduire quoi que ce soit d'un profil absent :
   * sans lui, `onboardingShown` vaut faux par défaut et on renvoie au
   * questionnaire quelqu'un qui l'a terminé depuis des mois.
   */
  const profileUnavailable = Boolean(queryError) && !profile

  /**
   * Pendant la restauration du cache persisté, React Query met les requêtes en
   * PAUSE : leur statut reste « en attente » mais `isLoading` vaut faux, faute
   * de requête en vol. Le profil se lisait alors comme un profil VIDE, donc
   * `onboardingShown` faux, donc « il reste à remplir » : de quoi montrer le
   * questionnaire à quelqu'un qui l'a terminé. La fenêtre est courte et le
   * splash la couvrait, mais c'est la même erreur de raisonnement que celle qui
   * a coûté l'écran figé : déduire d'une absence.
   *
   * Ce n'est pas une porte qui peut se bloquer : `LOADER_MAX_MS` côté écran
   * convertit l'attente en destination si la restauration s'éternisait.
   */
  const isRestoring = useIsRestoring()
  const gateLoading = isLoading || (isRestoring && !profile && Boolean(userId))

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
  const dataConsentGiven = useMemo(() => {
    const raw = prefs.data_consent
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false
    return (raw as Record<string, unknown>).granted === true
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

  const giveDataConsent = useCallback(async () => {
    if (!userId) return
    const current = asPrefsObject(
      queryClient.getQueryData<UserProfileRow | null>(queryKey)?.preferences ??
        profile?.preferences,
    )
    const next: Record<string, unknown> = {
      ...current,
      data_consent: {
        granted: true,
        at: new Date().toISOString(),
        version: DATA_CONSENT_VERSION,
      },
    }
    // Optimiste + SYNCHRONE : le guard voit le consentement dans le même tick,
    // donc il ne renvoie pas sur l'écran qu'on vient de valider.
    const nextPreferences = next as UserProfileRow['preferences']
    queryClient.setQueryData<UserProfileRow | null>(queryKey, (old) =>
      old
        ? { ...old, preferences: nextPreferences }
        : ({ id: userId, preferences: nextPreferences } as UserProfileRow),
    )
    await mutation.mutateAsync(next)
    phCapture('data_consent_granted', { version: DATA_CONSENT_VERSION })
  }, [userId, queryClient, queryKey, profile?.preferences, mutation])

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
    isLoading: gateLoading,
    profileUnavailable,
    isSaving: mutation.isPending,
    isProfileComplete,
    onboardingShown,
    paywallShown,
    dataConsentGiven,
    error,
    saveSkin,
    markOnboardingShown,
    completeOnboarding,
    giveDataConsent,
    updateProfile,
    refresh,
  }
}
