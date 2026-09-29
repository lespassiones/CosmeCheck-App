import { Platform } from 'react-native'

/**
 * Délai iOS avant de naviguer après la fermeture d'une fenêtre (RN `<Modal>` ou
 * feuille animée) : plus long que l'animation de sortie (220 à 300 ms).
 */
export const IOS_MODAL_DISMISS_MS = 450

/**
 * Lance `action` (typiquement une navigation) une fois la fenêtre qu'on vient
 * de fermer réellement retirée de l'écran.
 *
 * POURQUOI : sur iOS, pousser un écran (surtout un écran natif « modal » comme
 * /offre) pendant qu'un `<Modal>` React Native est encore en train de se fermer
 * peut laisser un calque transparent au-dessus de tout : plus aucun toucher ne
 * passe, l'app paraît figée (react-native-screens #1813, #2048). Même principe
 * que PromesseChooserSheet (navigation différée à la fermeture).
 */
export function runAfterModalClose(action: () => void, iosDelayMs: number = IOS_MODAL_DISMISS_MS): void {
  setTimeout(action, Platform.OS === 'ios' ? iosDelayMs : 0)
}

/** Version `await` de runAfterModalClose (ex. déconnexion après une confirmation). */
export function waitForModalClose(iosDelayMs: number = IOS_MODAL_DISMISS_MS): Promise<void> {
  return new Promise((resolve) => runAfterModalClose(resolve, iosDelayMs))
}
