/**
 * Retours haptiques de l'app, nommés par intention plutôt que par API.
 *
 * Un seul endroit pour doser les vibrations : un choix coché ne vibre pas
 * comme un bouton qui valide, ni comme un résultat qui tombe. Tous les appels
 * sont best-effort (appareil sans moteur, simulateur, réglage système coupé) :
 * une vibration ratée ne doit jamais interrompre un parcours.
 */

import * as Haptics from 'expo-haptics'

const safe = (p: Promise<unknown>): void => {
  p.catch(() => {})
}

export const haptic = {
  /** Déplacer un curseur, décocher, changer d'onglet : le plus discret. */
  selection: () => safe(Haptics.selectionAsync()),
  /** Cocher une option : un petit clic franc. */
  select: () => safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** Bouton principal, validation d'une étape. */
  press: () => safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  /** Un élément qui se pose (ligne cochée, bulle qui arrive). */
  tick: () => safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft)),
  /** Un chiffre qui tombe, un moment fort. */
  thud: () => safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),
  /** Résultat positif : consentement, réglage terminé, bonne pioche. */
  success: () => safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** Résultat qui demande l'attention : ingrédient à éviter trouvé. */
  warning: () => safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  /** Échec (formulaire refusé, réseau). */
  error: () => safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
}
