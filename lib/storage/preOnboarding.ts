/**
 * Pré-onboarding : flag de SESSION (durée de vie : un lancement d'app).
 *
 * Règle produit, volontairement absolue : **tant que personne n'est connecté,
 * on montre le carrousel de présentation**. À chaque démarrage à froid, et
 * aussi après une déconnexion. C'est la première chose que voit quelqu'un qui
 * installe l'app, et la vitrine ne doit jamais être court-circuitée par l'écran
 * de connexion.
 *
 * Pourquoi ce n'est plus persisté dans AsyncStorage (changement du 28/08/2026) :
 * l'ancienne version écrivait `cosmecheck:preonboarding_done` sur l'appareil.
 * Conséquence : au 2ᵉ lancement, une personne toujours déconnectée tombait
 * directement sur l'écran de connexion, sans jamais revoir la présentation.
 * Le flag ne sert donc plus qu'à UNE chose : éviter que le guard ne renvoie au
 * carrousel la personne qui vient d'appuyer sur « Commencer » et se dirige vers
 * l'inscription. Un booléen mémoire suffit, et il repart à `false` tout seul au
 * prochain démarrage, ce qui EST le comportement recherché.
 *
 * Corollaire : plus aucune lecture asynchrone au boot, donc plus l'état `null`
 * « lecture en cours » qui laissait passer une frame d'écran arbitraire avant
 * que le guard ne tranche.
 */

/** Vrai une fois le carrousel traversé (« Commencer » ou « Passer »), ce lancement-ci. */
let seenThisLaunch = false

/**
 * Abonnés au drapeau. Même raison que dans `lib/auth/signInPending.ts` :
 * l'`AuthGuard` lit cette valeur dans un effet, et un booléen de module
 * n'apparaît dans aucune liste de dépendances. Sans notification, un changement
 * de drapeau ne provoque aucune réévaluation, et une abstention devient
 * définitive.
 */
const abonnes = new Set<() => void>()

function prevenir(): void {
  for (const f of abonnes) f()
}

/** S'abonner aux changements du drapeau. Rend la fonction de désabonnement. */
export function subscribePreOnboarding(ecouteur: () => void): () => void {
  abonnes.add(ecouteur)
  return () => {
    abonnes.delete(ecouteur)
  }
}

/** Le carrousel a-t-il déjà été traversé pendant CE lancement de l'app ? */
export function hasSeenPreOnboardingThisLaunch(): boolean {
  return seenThisLaunch
}

/**
 * Marque le carrousel comme traversé. Synchrone à dessein : l'AuthGuard lit la
 * valeur dans le même tick que la navigation du carrousel, donc aucun rebond.
 */
export function markPreOnboardingDone(): void {
  seenThisLaunch = true
  prevenir()
}

/**
 * Rearme le carrousel pour la suite de ce lancement. Appelé à la déconnexion
 * (on redevient un visiteur, donc on revoit la vitrine) et par le bouton
 * « Revoir la présentation » du profil.
 */
export function resetPreOnboarding(): void {
  seenThisLaunch = false
  prevenir()
}
