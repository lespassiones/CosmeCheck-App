/**
 * useAuth — hook principal d'authentification.
 *
 * L'état de session est partagé via un store zustand module-level : un SEUL
 * abonnement `onAuthStateChange` est créé pour toute l'app (au premier montage),
 * ce qui évite des abonnements multiples et garde tous les consommateurs en phase.
 *
 * Retour :
 *   { user, session, isLoading, isAuthenticated, signOut, refreshSession }
 */

import { useEffect } from 'react'
import { create } from 'zustand'
import type { Session, Subscription, User } from '@supabase/supabase-js'

import { supabase } from '@/lib/supabase/client'
import { clearUserScopedCaches } from '@/lib/storage/clearUserScopedCaches'

interface UseAuthReturn {
  user: User | null
  session: Session | null
  isLoading: boolean
  isAuthenticated: boolean
  signOut: () => Promise<void>
  refreshSession: () => Promise<void>
}

interface AuthState {
  user: User | null
  session: Session | null
  isLoading: boolean
  setSession: (session: Session | null) => void
}

const useAuthStore = create<AuthState>((set) => ({
  user: null,
  session: null,
  isLoading: true,
  setSession: (session) => set({ user: session?.user ?? null, session }),
}))

// ── Initialisation unique (module-level) ────────────────────────────

let initialized = false
let authSubscription: Subscription | null = null

function initAuth(): void {
  if (initialized) return
  initialized = true

  const { setSession } = useAuthStore.getState()

  // Session initiale (lecture cache + refresh éventuel).
  supabase.auth
    .getSession()
    .then(({ data: { session } }) => {
      setSession(session)
    })
    .catch(() => {
      setSession(null)
    })
    .finally(() => {
      useAuthStore.setState({ isLoading: false })
    })

  // Abonnement temps réel : SIGNED_IN / SIGNED_OUT / TOKEN_REFRESHED /
  // USER_UPDATED / PASSWORD_RECOVERY.
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    setSession(session)
    useAuthStore.setState({ isLoading: false })
  })
  authSubscription = data.subscription
}

/**
 * Nettoie l'abonnement global. Utile pour les tests / hot-reload ;
 * non appelé en production (l'abonnement vit aussi longtemps que l'app).
 */
export function teardownAuth(): void {
  authSubscription?.unsubscribe()
  authSubscription = null
  initialized = false
}

// ── Hook ────────────────────────────────────────────────────────────

export function useAuth(): UseAuthReturn {
  const user = useAuthStore((s) => s.user)
  const session = useAuthStore((s) => s.session)
  const isLoading = useAuthStore((s) => s.isLoading)

  useEffect(() => {
    initAuth()
  }, [])

  const signOut = async (): Promise<void> => {
    await supabase.auth.signOut()
    // onAuthStateChange mettra le store à jour ; on force l'état localement
    // pour une UI réactive immédiate.
    useAuthStore.getState().setSession(null)
    // Purge les caches liés au compte (évite toute fuite inter-comptes sur le
    // même appareil). Best-effort, ne bloque pas la déconnexion.
    await clearUserScopedCaches()
  }

  const refreshSession = async (): Promise<void> => {
    const { data } = await supabase.auth.refreshSession()
    useAuthStore.getState().setSession(data.session)
  }

  return {
    user,
    session,
    isLoading,
    isAuthenticated: !!user && !!session,
    signOut,
    refreshSession,
  }
}
