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
import { phIdentify, phReset } from '@/lib/analytics/posthog'

import { supabase } from '@/lib/supabase/client'
import { clearUserScopedCaches } from '@/lib/storage/clearUserScopedCaches'
import { resetPreOnboarding } from '@/lib/storage/preOnboarding'
import { logoutUser } from '@/lib/revenucat/client'
import { bounded } from '@/lib/utils/withTimeout'

/**
 * Plafond de la lecture de session au démarrage.
 *
 * Volontairement une constante du code et non un réglage de `app_config` :
 * `app_config` se lit par le réseau, donc au moment précis où ce plafond sert,
 * on ne peut pas le connaître. Un plafond qui dépend de ce qu'il protège ne
 * protège rien.
 *
 * Huit secondes : un démarrage sain tient très largement en dessous, ce plafond
 * ne coupe donc jamais un lancement normal. Il ne coupe que ceux qui ne
 * finiraient pas.
 */
const AUTH_BOOT_TIMEOUT_MS = 8000

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

  // Session initiale (lecture cache + refresh éventuel), BORNÉE.
  //
  // `getSession()` lit d'abord le stockage, mais rafraîchit par le réseau quand
  // le jeton a expiré, et ce rafraîchissement n'a aucun plafond. Un réseau qui
  // accepte la connexion sans jamais répondre laissait donc la promesse en
  // suspens : le `.finally()` ne s'exécutait pas, `isLoading` restait vrai à
  // vie, et l'app tournait indéfiniment sur son indicateur de chargement. Aucun
  // plantage, aucune trace, et de l'extérieur une app qui ne répond pas, ce qui
  // est le motif de refus App Store 2.1(a).
  void (async () => {
    try {
      const res = await bounded(supabase.auth.getSession(), AUTH_BOOT_TIMEOUT_MS)

      if (res.ok) {
        const { data, error } = res.value
        // Refresh token périmé/invalide ("Invalid Refresh Token: Not Found") →
        // on PURGE la session stockée (signOut local) au lieu de laisser
        // l'auto-refresh en arrière-plan relever une AuthApiError non gérée.
        if (error) {
          await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
          setSession(null)
        } else {
          setSession(data.session)
        }
      } else if (res.reason === 'error') {
        await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
        setSession(null)
      } else {
        // Délai dépassé. On NE purge PAS la session : un réseau muet n'est pas
        // un jeton invalide, et déconnecter ici mettrait dehors quiconque ouvre
        // l'app hors ligne. On démarre en visiteur, et `onAuthStateChange`
        // rétablira la session dès que la requête finira par aboutir.
        console.warn('[auth] lecture de session non aboutie, démarrage en visiteur')
      }
    } finally {
      // La seule ligne qui garantit qu'un écran s'affiche, quoi qu'il arrive au
      // réseau. Elle doit rester dans ce `finally`, et nulle part ailleurs.
      useAuthStore.setState({ isLoading: false })
    }
  })()

  // Abonnement temps réel : SIGNED_IN / SIGNED_OUT / TOKEN_REFRESHED /
  // USER_UPDATED / PASSWORD_RECOVERY.
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    // Analytics : distinct_id = ID technique Supabase UNIQUEMENT (aucun email ni
    // nom transmis à PostHog → mesure d'audience anonyme exemptée de consentement).
    if (session?.user) phIdentify(session.user.id)
    else phReset()
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
    // ⚠️ PREMIÈRE LIGNE, avant le moindre `await`. Se déconnecter, c'est
    // redevenir un visiteur, donc on rearme le carrousel de présentation.
    //
    // Cet appel était placé après `supabase.auth.signOut()`, ce qui ne servait
    // à rien : `signOut()` déclenche `onAuthStateChange` avec une session nulle
    // AVANT de rendre la main. L'AuthGuard réagissait donc au passage à
    // `isAuthenticated: false` alors que le flag valait encore `true`, et
    // renvoyait vers l'écran de bienvenue au lieu du carrousel. Vérifié sur
    // émulateur le 28/08/2026 : on atterrissait bien sur « Bienvenue ».
    resetPreOnboarding()
    await supabase.auth.signOut()
    // Rendre son identité à RevenueCat : sans ça, le SDK garde l'`appUserID`
    // du compte précédent après la déconnexion, et l'appareil reste porteur de
    // ses droits jusqu'à la prochaine connexion. Best-effort, ne bloque rien.
    await logoutUser().catch(() => {})
    // onAuthStateChange mettra le store à jour ; on force l'état localement
    // pour une UI réactive immédiate.
    useAuthStore.getState().setSession(null)
    // Purge les caches liés au compte (évite toute fuite inter-comptes sur le
    // même appareil). Best-effort, ne bloque pas la déconnexion.
    await clearUserScopedCaches()
  }

  const refreshSession = async (): Promise<void> => {
    try {
      const { data, error } = await supabase.auth.refreshSession()
      if (error) throw error
      useAuthStore.getState().setSession(data.session)
    } catch {
      // Token de refresh invalide → on nettoie au lieu de propager l'erreur.
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
      useAuthStore.getState().setSession(null)
    }
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
