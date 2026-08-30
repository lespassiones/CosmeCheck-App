/**
 * Rejeu du parcours d'accueil pour le compte de démonstration remis à Apple.
 *
 * Pourquoi ce module existe. Le vérificateur d'Apple se connecte avec les
 * identifiants fournis dans « Informations utiles à la vérification de l'app ».
 * Ce compte a déjà terminé l'onboarding, donc il atterrit directement sur
 * l'accueil : il ne voit ni l'écran de consentement RGPD, ni le questionnaire de
 * profil, ni l'opt-in notifications. Il peut alors refuser l'app pour un écran
 * qu'il n'a tout simplement pas pu observer, alors que l'app le présente bien à
 * toute personne qui s'inscrit.
 *
 * La réponse : sur CE compte précisément, chaque connexion par e-mail et mot de
 * passe efface les traces du parcours et le fait rejouer entièrement. Les
 * réponses données pendant la vérification écrasent les précédentes, donc c'est
 * toujours la valeur la plus récente qui est en base.
 *
 * ── Deux choix de conception ────────────────────────────────────────────────
 *
 * 1. Le compte est désigné par un DRAPEAU EN BASE (`preferences.review_replay`),
 *    jamais par son adresse écrite en dur. Une adresse dans le binaire est une
 *    donnée figée qu'on ne peut plus changer sans republier, et elle se lit dans
 *    le paquet. Le drapeau se pose et se retire en une requête, sur le compte
 *    qu'on veut, sans toucher au code.
 *
 * 2. Le rejeu n'est branché QUE sur la connexion e-mail plus mot de passe
 *    (`lib/auth/session.ts`). C'est le seul chemin qu'Apple utilise, et le
 *    restreindre garantit qu'aucun parcours ordinaire ne peut le déclencher.
 */

/** Clé du drapeau dans `user_profiles.preferences`. */
export const REVIEW_REPLAY_FLAG = 'review_replay'

/**
 * Clés effacées à chaque rejeu : très exactement ce que le parcours d'accueil
 * écrit, et rien d'autre.
 *
 * `restrictions` n'y figure pas volontairement : elle se règle depuis « Mes
 * restrictions », pas pendant l'onboarding, et l'effacer priverait le
 * vérificateur d'un profil réaliste sur le reste de l'app.
 */
export const REPLAYED_KEYS = [
  'data_consent', // écran de consentement
  'skin', // questionnaire de profil
  'onboardingShown', // drapeau de fin de questionnaire
  'paywall_shown', // paywall post-onboarding
  'notifications', // étape d'opt-in notifications
] as const

/** Le compte porte-t-il le drapeau de rejeu ? */
export function isReviewReplayAccount(
  preferences: Record<string, unknown> | null | undefined,
): boolean {
  if (!preferences || typeof preferences !== 'object') return false
  return preferences[REVIEW_REPLAY_FLAG] === true
}

/**
 * Rend une copie de `preferences` sans les clés du parcours.
 *
 * Le drapeau est conservé : sans lui le rejeu n'aurait lieu qu'une fois, alors
 * qu'il doit se produire à CHAQUE connexion, y compris lors des vérifications
 * des mises à jour suivantes.
 */
export function stripForReplay(
  preferences: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const source =
    preferences && typeof preferences === 'object' && !Array.isArray(preferences)
      ? preferences
      : {}
  const next: Record<string, unknown> = { ...source }
  for (const cle of REPLAYED_KEYS) delete next[cle]
  next[REVIEW_REPLAY_FLAG] = true
  return next
}
