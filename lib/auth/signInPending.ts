/**
 * Drapeau mémoire : une connexion par e-mail est en cours de finalisation.
 *
 * Pourquoi il existe. `signInWithPassword` ouvre la session AVANT que `signIn`
 * n'ait fini son travail. L'AuthGuard réagit donc immédiatement au passage à
 * `isAuthenticated: true`, pendant que la requête de profil part en parallèle et
 * ramène l'état d'AVANT. Pour le compte de démonstration d'Apple, cet état dit
 * encore « onboarding terminé » : le guard route vers l'accueil, puis la remise
 * à zéro aboutit et il corrige vers le consentement. On voit l'accueil clignoter
 * une demi-seconde. Signalé le 28/08/2026.
 *
 * Tant que ce drapeau est levé, le guard s'abstient, exactement comme il le fait
 * déjà pendant `authLoading` et `profileLoading`. Il ne décide qu'une fois que
 * le profil qu'il lit est le bon.
 *
 * Mémoire volontairement, jamais persisté : une connexion interrompue par un
 * plantage ne doit pas laisser l'app bloquée au lancement suivant. Un simple
 * redémarrage repart à `false`.
 */

let pending = false

/**
 * Abonnés au drapeau.
 *
 * ⚠️ Ce n'est pas un confort. L'`AuthGuard` LIT ce drapeau dans son effet, et
 * un booléen de module ne figure dans aucune liste de dépendances React. Quand
 * le guard s'abstenait parce que le drapeau était levé, RIEN ne le réveillait à
 * sa retombée : sa dernière décision, « ne bouge pas », restait la bonne pour
 * toujours. Prévenir les abonnés est ce qui transforme une abstention
 * définitive en simple attente.
 */
const abonnes = new Set<() => void>()

function prevenir(): void {
  for (const f of abonnes) f()
}

/** S'abonner aux changements du drapeau. Rend la fonction de désabonnement. */
export function subscribeSignInPending(ecouteur: () => void): () => void {
  abonnes.add(ecouteur)
  return () => {
    abonnes.delete(ecouteur)
  }
}

/** Une connexion e-mail est-elle en train de se finaliser ? */
export function isSignInPending(): boolean {
  return pending
}

/** Encadre la finalisation d'une connexion. Le drapeau retombe TOUJOURS. */
export async function withSignInPending<T>(travail: () => Promise<T>): Promise<T> {
  pending = true
  prevenir()
  try {
    return await travail()
  } finally {
    // Dans le `finally` : une erreur réseau ne doit pas laisser le guard muet.
    pending = false
    prevenir()
  }
}

/** Réinitialisation, pour les tests. */
export function resetSignInPending(): void {
  pending = false
  prevenir()
}
