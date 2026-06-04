/**
 * Décision de routage de l'AuthGuard, extraite en fonction PURE pour être
 * testable sans React/expo-router. Le composant `AuthGuard` (`app/_layout.tsx`)
 * mappe la cible symbolique renvoyée vers `router.replace(ROUTES.*)`.
 *
 * Zone historiquement bug-prone (rebonds onboarding / boucles de redirection) :
 * chaque branche est conditionnée par le segment courant pour éviter les boucles.
 */

export type AuthRouteTarget =
  | 'signin'
  | 'preonboarding'
  | 'onboarding'
  | 'home'
  | null // null = aucune redirection (laisser passer / attendre)

export interface AuthRouteInput {
  /** Auth pas encore résolue → splash, on attend. */
  authLoading: boolean
  isAuthenticated: boolean
  /** Profil pas encore chargé (décide l'onboarding) → on attend. */
  profileLoading: boolean
  onboardingShown: boolean
  isProfileComplete: boolean
  /** Flag device pré-onboarding : `null` = lecture en cours. */
  preOnbDone: boolean | null
  /** `segments[0]` d'expo-router : `'(auth)'` | `'(onboarding)'` | `'(preonboarding)'` | … */
  group: string | undefined
}

export function resolveAuthRoute(input: AuthRouteInput): AuthRouteTarget {
  const {
    authLoading,
    isAuthenticated,
    profileLoading,
    onboardingShown,
    isProfileComplete,
    preOnbDone,
    group,
  } = input

  // 1. Auth pas encore résolue : ne rien faire (splash visible).
  if (authLoading) return null

  const inAuthGroup = group === '(auth)'
  const inOnboarding = group === '(onboarding)'
  const inPreOnboarding = group === '(preonboarding)'

  // 2. Pas de session.
  if (!isAuthenticated) {
    // On laisse l'auth et le pré-onboarding s'afficher librement (anti-boucle).
    if (inAuthGroup || inPreOnboarding) return null
    if (preOnbDone === null) return null // flag encore en lecture
    return preOnbDone ? 'signin' : 'preonboarding'
  }

  // 3. Authentifié : le profil décide l'onboarding → on attend son chargement.
  if (profileLoading) return null

  const needsOnboarding = !onboardingShown && !isProfileComplete

  // 4. Sur une page auth/pré-onboarding alors qu'on est connecté → destination.
  if (inAuthGroup || inPreOnboarding) {
    return needsOnboarding ? 'onboarding' : 'home'
  }

  // 5. Onboarding requis mais on n'y est pas → onboarding.
  if (needsOnboarding && !inOnboarding) return 'onboarding'

  // 6. On quitte l'onboarding UNIQUEMENT quand il a été explicitement terminé
  //    (onboardingShown=true). On NE se base PAS sur isProfileComplete : sinon
  //    remplir 2 sections en cours de questionnaire éjecterait l'utilisateur.
  if (onboardingShown && inOnboarding) return 'home'

  // Sinon : on laisse passer.
  return null
}
