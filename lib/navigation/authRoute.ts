/**
 * Décision de routage de l'AuthGuard, extraite en fonction PURE pour être
 * testable sans React/expo-router. Le composant `AuthGuard` (`app/_layout.tsx`)
 * mappe la cible symbolique renvoyée vers `router.replace(ROUTES.*)`.
 *
 * Zone historiquement bug-prone (rebonds onboarding / boucles de redirection) :
 * chaque branche est conditionnée par le segment courant pour éviter les boucles.
 *
 * ── Règle non négociable (28/08/2026) ────────────────────────────────────────
 * **Personne non connectée ⇒ carrousel de présentation.** Toujours : première
 * installation, réouverture, retour après déconnexion. L'écran de connexion
 * n'est JAMAIS un point d'entrée.
 *
 * Le défaut corrigé : `app/` n'a pas de route racine, et quatre groupes
 * revendiquaient `/`, et expo-router servait `(onboarding)`, dont le layout
 * redirigeait vers `welcome` quand on n'était pas connecté. Le guard voyait
 * alors le groupe `(auth)` et s'abstenait (anti-boucle historique), verrouillant
 * la personne sur l'écran de connexion sans jamais montrer le carrousel. D'où
 * le « clignotement » d'onboarding au lancement, symptôme du même aller-retour.
 *
 * Ce n'est donc plus le fait d'être dans `(auth)` qui autorise à y rester, mais
 * le fait d'avoir traversé le carrousel PENDANT CE LANCEMENT (`preOnbSeen`).
 *
 * ── Onboarding « Le diagnostic de Perle » (28/09/2026) ──────────────────────
 * Le carrousel est remplacé par le parcours invité (`(preonboarding)`), qui
 * pose les questions AVANT le compte, consentement compris. Deux conséquences :
 *   - l'écran `/consent` n'existe plus : le parcours recueille lui-même le
 *     consentement (en mode invité comme en mode connecté) ;
 *   - juste après l'inscription, les réponses du parcours sont en cours
 *     d'écriture (`draftPending`) : le guard s'abstient, sinon il renverrait au
 *     questionnaire quelqu'un qui vient d'y répondre.
 */

export type AuthRouteTarget =
  | 'welcome'
  | 'preonboarding'
  | 'onboarding'
  | 'paywall'
  | 'home'
  | null // null = aucune redirection (laisser passer / attendre)

export interface AuthRouteInput {
  /** Auth pas encore résolue → splash, on attend. */
  authLoading: boolean
  /**
   * Une connexion e-mail est en train de se finaliser. La session est déjà
   * ouverte mais le profil lu peut encore être celui d'AVANT : on ne décide
   * rien tant que ce n'est pas fini. Voir `lib/auth/signInPending.ts`.
   */
  signInPending: boolean
  isAuthenticated: boolean
  /** Profil pas encore chargé (décide l'onboarding) → on attend. */
  profileLoading: boolean
  /**
   * Le profil n'a PAS pu être lu (erreur réseau, refus, ou délai dépassé).
   *
   * Sans cette entrée, un profil absent se lit comme un profil vide :
   * `onboardingShown` vaut faux, `isProfileComplete` aussi, donc
   * `needsOnboarding` devient vrai et on renvoie au consentement puis au
   * questionnaire quelqu'un qui les a passés depuis longtemps. On préfère
   * FAIL-OPEN vers l'accueil, comme `MaintenanceGate` : le prochain lancement
   * lira le profil et ramènera le questionnaire s'il reste vraiment à remplir.
   */
  profileUnavailable: boolean
  onboardingShown: boolean
  isProfileComplete: boolean
  paywallShown: boolean
  /**
   * Un parcours d'onboarding terminé AVANT le compte attend d'être écrit dans
   * le profil (`lib/onboarding/draft.ts`). Tant qu'il l'est, on ne décide rien.
   */
  draftPending: boolean
  /**
   * Carrousel de présentation traversé pendant CE lancement de l'app.
   * Volontairement non persisté : voir `lib/storage/preOnboarding.ts`.
   */
  preOnbSeen: boolean
  /** `segments[0]` d'expo-router : `'(auth)'` | `'(onboarding)'` | `'offre'` | … */
  group: string | undefined
}

export function resolveAuthRoute(input: AuthRouteInput): AuthRouteTarget {
  const {
    authLoading,
    signInPending,
    isAuthenticated,
    profileLoading,
    profileUnavailable,
    onboardingShown,
    isProfileComplete,
    paywallShown,
    draftPending,
    preOnbSeen,
    group,
  } = input

  // 1. Auth pas encore résolue : ne rien faire (splash visible).
  if (authLoading) return null

  // 1 bis. Connexion en cours de finalisation : la session est ouverte mais le
  //        profil peut encore être périmé. Décider maintenant ferait clignoter
  //        une destination qu'on corrigerait aussitôt.
  if (signInPending) return null

  const inAuthGroup = group === '(auth)'
  const inOnboarding = group === '(onboarding)'
  // Le paywall EST la page /offre (groupe 'offre'). L'ancien groupe (paywall)
  // a été supprimé : c'était un écran mort, en anglais, et l'un des quatre
  // prétendants à `/` qui faisaient s'ouvrir l'app sur la connexion.
  const inOffre = group === 'offre'
  // Bienvenue Premium : on vient d'acheter, donc surtout pas de renvoi vers le
  // paywall parce que `paywall_shown` n'est pas encore remonté du serveur.
  const inPremiumWelcome = group === 'premium'
  const inPreOnboarding = group === '(preonboarding)'

  // 2. Pas de session → le carrousel, sauf s'il vient d'être traversé.
  if (!isAuthenticated) {
    // Sur le carrousel : on laisse, évidemment.
    if (inPreOnboarding) return null
    // Sur un écran d'auth : on n'y a le droit qu'APRÈS avoir vu le carrousel.
    // Sinon on l'y ramène, et c'est tout le correctif.
    if (inAuthGroup) return preOnbSeen ? null : 'preonboarding'
    // Ailleurs (tabs, deep link, groupe arbitraire servi sur `/`…).
    return preOnbSeen ? 'welcome' : 'preonboarding'
  }

  // 2 bis. Réponses du parcours invité en cours d'écriture : le profil lu est
  //        encore celui d'AVANT. On attend, la cible tombera d'elle-même.
  if (draftPending) return null

  // 3. Authentifié : le profil décide l'onboarding → on attend son chargement.
  if (profileLoading) return null

  // 3 bis. Profil illisible : on ne déduit RIEN de son absence, on ouvre l'app.
  //        Renvoyer au questionnaire ferait refaire son onboarding à quelqu'un
  //        pour un simple réseau muet ; laisser `null` figerait l'écran qui
  //        attend cette décision. La seule issue saine est une destination.
  //        Mais SEULEMENT pour les écrans qui l'attendent (démarrage, connexion,
  //        parcours) : le guard rejoue à chaque changement de groupe, et toute
  //        autre page (analyse, Advisor, fiche, compare…) était renvoyée à
  //        l'accueil dès son ouverture, en pleine animation d'entrée (29/09/2026).
  if (profileUnavailable) {
    const ecranEnAttente = group === undefined || inAuthGroup || inPreOnboarding || inOnboarding
    return ecranEnAttente ? 'home' : null
  }

  const needsOnboarding = !onboardingShown && !isProfileComplete

  // 4. Le consentement (données de santé, RGPD art. 9) est recueilli PAR le
  //    parcours d'onboarding lui-même, avant toute question sur la peau : il
  //    n'y a plus d'écran séparé à imposer ici.

  // 5. Sur une page auth/pré-onboarding alors qu'on est connecté → destination.
  if (inAuthGroup || inPreOnboarding) {
    if (needsOnboarding) return 'onboarding'
    if (!paywallShown) return 'paywall'
    return 'home'
  }

  // 6. Onboarding requis mais on n'y est pas → onboarding.
  if (needsOnboarding && !inOnboarding) return 'onboarding'

  // 7. On quitte l'onboarding UNIQUEMENT quand il a été explicitement terminé
  //    (onboardingShown=true). On NE se base PAS sur isProfileComplete : sinon
  //    remplir 2 sections en cours de questionnaire éjecterait l'utilisateur.
  if (onboardingShown && inOnboarding) {
    // Si paywall pas vu, aller au paywall sinon home
    return !paywallShown ? 'paywall' : 'home'
  }

  // 9. Paywall pas vu et profil complet → paywall, sauf si on y est déjà ou si
  //    on est sur l'écran de bienvenue post-achat.
  //
  //    On ne fait PAS l'inverse (éjecter de /offre quand le paywall a été vu) :
  //    /offre est aussi une page ordinaire, ouverte depuis le menu ou le profil
  //    pour consulter l'offre ou gérer son abonnement. C'est l'écran lui-même
  //    qui décide de sortir, vers l'accueil au « Plus tard » et vers la
  //    bienvenue Premium après un achat.
  if (
    onboardingShown &&
    isProfileComplete &&
    !paywallShown &&
    !inOffre &&
    !inPremiumWelcome
  ) {
    return 'paywall'
  }

  // Sinon : on laisse passer.
  return null
}
