/**
 * Mise à jour OTA dès le tout premier lancement (03/11/2026).
 *
 * Par défaut, expo-updates télécharge l'OTA en arrière-plan et ne l'applique
 * qu'au lancement SUIVANT. Une personne qui installe l'app fait donc tout son
 * premier parcours (onboarding, paywall) sur le code embarqué dans le store,
 * même quand une OTA plus récente existe.
 *
 * Au premier lancement seulement, on retient l'écran de démarrage le temps que
 * le téléchargement natif aboutisse, 3 s au plus : s'il aboutit, on recharge
 * aussitôt sur la nouvelle version, avant que l'onboarding ne s'affiche ; sinon
 * on continue normalement. Un réseau lent ne bloque jamais l'ouverture.
 *
 * Logique pure (testée), branchée par `hooks/useFirstLaunchUpdateHold.ts`.
 */

/** Plafond d'attente, compté depuis le démarrage du JS. */
export const FIRST_LAUNCH_UPDATE_MAX_MS = 3000

/**
 * Posée dès le premier lancement, avant tout rechargement : un rechargement qui
 * planterait ne peut pas se répéter en boucle. Hors préfixe `cosmecheck:`, que
 * la déconnexion purge (`clearUserScopedCaches`).
 */
export const FIRST_LAUNCH_UPDATE_KEY = 'cc-app:first-launch-update-checked'

export type FirstLaunchStep = 'wait' | 'reload' | 'release'

export interface FirstLaunchState {
  /** Premier lancement sur le code embarqué. `null` = encore en lecture. */
  eligible: boolean | null
  /** Plafond dépassé. */
  expired: boolean
  /** expo-updates a fini de télécharger une version plus récente. */
  isUpdatePending: boolean
  /** Le démarrage natif (vérification + téléchargement) est encore en cours. */
  isStartupProcedureRunning: boolean
}

export function firstLaunchStep(s: FirstLaunchState): FirstLaunchStep {
  if (s.eligible === false) return 'release'
  // Passé le plafond, l'onboarding est peut-être déjà à l'écran : on ne
  // recharge plus, l'OTA s'appliquera au lancement suivant.
  if (s.expired) return 'release'
  if (s.eligible === null) return 'wait'
  if (s.isUpdatePending) return 'reload'
  // Vérification terminée sans rien à télécharger : inutile d'attendre.
  if (!s.isStartupProcedureRunning) return 'release'
  return 'wait'
}
