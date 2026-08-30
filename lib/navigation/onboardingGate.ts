/**
 * Décision du layout `app/(onboarding)/_layout.tsx`, extraite en fonction PURE.
 *
 * ── Le défaut verrouillé ici (30/08/2026) ────────────────────────────────────
 *
 * Ce layout est, de fait, le premier écran monté au démarrage. Il affichait un
 * indicateur de chargement dans trois cas, et le troisième n'avait AUCUNE
 * sortie à lui : quand l'onboarding était déjà terminé, il montrait un spinner
 * et s'en remettait entièrement à l'`AuthGuard` pour être démonté.
 *
 * Or la règle du guard qui doit l'en sortir (règle 7 de `authRoute.ts`) est
 * conditionnée à `segments[0] === '(onboarding)'`. Si expo-router rapporte un
 * autre segment, plus rien ne bouge : le layout attend le guard, le guard
 * attend un segment. L'énumération de `bootDeadlock.test.ts` comptait
 * 56 combinaisons terminales dans ce cas.
 *
 * Le piège se refermait sur lui-même : en rendant l'indicateur, ce layout
 * renvoie une simple `View` AU LIEU de son `<Stack>`. Sans navigateur monté en
 * dessous, il n'y a plus de route enfant à nommer, donc il affamait le signal
 * exact dont il avait besoin pour partir.
 *
 * ── La règle qui remplace ça ────────────────────────────────────────────────
 *
 * Ce layout ne DÉLÈGUE plus sa sortie. Chaque état connu produit ici même une
 * destination, servie par `<Redirect>`, qui ne dépend d'aucun segment. Le
 * `loader` ne subsiste que pour les états où une réponse est réellement en
 * vol, et un plafond côté composant le convertit en destination s'il s'éternise.
 */

export type OnboardingGateTarget =
  /** Une réponse est en vol : on patiente (borné par le composant). */
  | 'loader'
  /** Personne connectée → la vitrine, toujours. */
  | 'preonboarding'
  /** Onboarding déjà terminé, paywall pas encore vu. */
  | 'paywall'
  /** Onboarding déjà terminé, ou profil illisible : l'app ordinaire. */
  | 'home'
  /** Il y a réellement quelque chose à remplir → le questionnaire. */
  | 'wizard'

export interface OnboardingGateInput {
  /** Lecture de session pas encore résolue (bornée à 8 s, cf. `useAuth`). */
  authLoading: boolean
  isAuthenticated: boolean
  /** Requête de profil en vol (bornée, cf. `useProfile`). */
  profileLoading: boolean
  /**
   * Le profil n'a PAS pu être lu (erreur ou délai dépassé). On ne déduit alors
   * rien de son contenu : `onboardingShown` vaudrait faux par défaut, ce qui
   * renverrait au questionnaire quelqu'un qui l'a terminé depuis longtemps.
   */
  profileUnavailable: boolean
  onboardingShown: boolean
  paywallShown: boolean
  /** Le plafond d'attente du composant est atteint : il faut trancher. */
  waitedTooLong: boolean
}

export function resolveOnboardingGate(
  input: OnboardingGateInput,
): OnboardingGateTarget {
  const {
    authLoading,
    isAuthenticated,
    profileLoading,
    profileUnavailable,
    onboardingShown,
    paywallShown,
    waitedTooLong,
  } = input

  // 1. Trop attendu : on sort par le haut plutôt que de rester une porte close.
  //    L'accueil est le choix sûr, il ne collecte rien et se recharge tout seul.
  if (waitedTooLong && (authLoading || profileLoading)) {
    return isAuthenticated ? 'home' : 'preonboarding'
  }

  // 2. Session pas encore connue → on patiente, c'est borné en amont.
  if (authLoading) return 'loader'

  // 3. Pas de session → la vitrine. Jamais l'écran de connexion.
  if (!isAuthenticated) return 'preonboarding'

  // 4. Profil illisible → on FAIL-OPEN vers l'accueil, comme `MaintenanceGate`.
  //    Un réseau muet ne doit pas faire refaire son onboarding à quelqu'un.
  //    Au prochain lancement le profil se lira, et le questionnaire reviendra
  //    de lui-même s'il reste réellement quelque chose à remplir.
  if (profileUnavailable) return 'home'

  // 5. Profil en vol → on patiente. Surtout pas le questionnaire : on ne sait
  //    pas encore s'il y a quelque chose à remplir.
  if (profileLoading) return 'loader'

  // 6. Onboarding déjà terminé → destination immédiate, décidée ICI.
  //
  //    ⚠️ On ne regarde QUE `onboardingShown`, jamais `isProfileComplete` :
  //    ce dernier devient vrai EN PLEIN questionnaire (deux sections sur trois
  //    suffisent), et démonterait le questionnaire sous les doigts.
  if (onboardingShown) return paywallShown ? 'home' : 'paywall'

  // 7. Il reste quelque chose à remplir.
  return 'wizard'
}
