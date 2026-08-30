/**
 * Borner une promesse, pour qu'un appel qui pend ne bloque jamais un écran.
 *
 * Deux formes, et le choix entre les deux n'est pas cosmétique :
 *
 *   - `withTimeout` REJETTE au-delà du délai. Pratique quand l'appelant traite
 *     déjà les erreurs et se moque de la cause.
 *   - `bounded` ne rejette JAMAIS et rend un résultat à examiner, ce qui oblige
 *     à distinguer un délai dépassé d'une vraie erreur. Cette distinction
 *     compte partout où l'échec déclenche une action destructive.
 */

/**
 * withTimeout — rejette si la promesse n'aboutit pas dans `ms` millisecondes.
 * Évite les écrans bloqués en « chargement » indéfini sur un fetch qui pend.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label = 'Délai dépassé',
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(label)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

/** Issue d'un appel borné par `bounded`. Jamais une exception : toujours un cas. */
export type Bounded<T> =
  | { ok: true; value: T }
  | { ok: false; reason: 'timeout' }
  | { ok: false; reason: 'error'; error: unknown }

/**
 * bounded — attend `promise` au plus `ms`, sans jamais rejeter.
 *
 * Pourquoi une seconde forme plutôt que `try { withTimeout(...) }` : parce que
 * le `catch` confondrait « le réseau n'a pas répondu » et « le serveur a dit
 * non ». Au démarrage de l'app, cette confusion coûte cher. Une lecture de
 * session qui expire est un problème de réseau, pas un jeton invalide ; purger
 * la session dans ce cas déconnecterait quelqu'un à chaque ouverture hors ligne.
 *
 * Ce module sert le correctif du refus App Store 2.1(a) « the app is
 * unresponsive and stays on the splash screen » : un seul appel qui accepte la
 * connexion sans jamais répondre suffit à laisser un drapeau « prêt » faux à
 * vie. La règle est que le démarrage peut finir MAL RENSEIGNÉ, c'est
 * rattrapable, mais qu'il ne peut pas NE PAS FINIR.
 */
export async function bounded<T>(promise: Promise<T>, ms: number): Promise<Bounded<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined

  const expiration = new Promise<Bounded<T>>((resolve) => {
    timer = setTimeout(() => resolve({ ok: false, reason: 'timeout' }), ms)
  })

  const course = promise.then(
    (value): Bounded<T> => ({ ok: true, value }),
    (error): Bounded<T> => ({ ok: false, reason: 'error', error }),
  )

  try {
    return await Promise.race([course, expiration])
  } finally {
    // Un minuteur oublié retient une référence vivante toute la session.
    if (timer !== undefined) clearTimeout(timer)
  }
}
