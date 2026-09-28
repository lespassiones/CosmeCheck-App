/**
 * Retour au toucher des boutons : logique PURE (testable en Node), utilisée par
 * `components/shared/HapticPressable.tsx`.
 *
 * Demande produit (28 sept 2026) : un retour haptique sur la quasi-totalité des
 * boutons, dosé selon l'importance de l'action, et accompagné d'une petite
 * transition. L'intensité s'exprime par l'UTILITÉ de l'action (`HapticLevel`),
 * jamais par l'API de vibration : le dosage réel vit dans `lib/haptics.ts`.
 */
import { haptic } from '@/lib/haptics'

/**
 * - `primary`   : action phare (Analyser, Ajouter à ma routine, Continuer).
 * - `secondary` : action courante, défaut (carte, ligne, lien, retour, fermer).
 * - `selection` : choix dans un ensemble (onglet, filtre, puce, interrupteur).
 * - `success`   : action dont l'issue est d'emblée positive (enregistrer).
 * - `warning`   : action destructive ou risquée (supprimer, retirer).
 * - `none`      : aucun retour (fond de modale qui ferme, zone passive).
 */
export type HapticLevel = 'primary' | 'secondary' | 'selection' | 'success' | 'warning' | 'none'

/** Déclenche le retour haptique d'un niveau. Best-effort, ne lève jamais. */
export function fireHaptic(level: HapticLevel): void {
  switch (level) {
    case 'primary':
      haptic.press()
      return
    case 'secondary':
      haptic.select()
      return
    case 'selection':
      haptic.selection()
      return
    case 'success':
      haptic.success()
      return
    case 'warning':
      haptic.warning()
      return
    case 'none':
      return
  }
}

/**
 * Faut-il ajouter la mini-transition (léger rétrécissement) ? Non si le bouton
 * gère DÉJÀ son propre effet au toucher : un `style` ou des `children` écrits
 * en fonction de `pressed` signalent un effet voulu par l'écran (opacité,
 * couleur...), qu'on ne double pas. Non plus si l'appelant l'a coupé
 * (`pressScale={false}`, ex. fond de modale plein écran), ni si l'élément ne
 * déclenche aucune action (zone qui ne fait que bloquer la propagation).
 */
export function shouldAnimatePress(args: {
  /** Le bouton déclenche une action (onPress ou onLongPress). */
  actionable: boolean
  styleIsFunction: boolean
  childrenIsFunction: boolean
  pressScale: number | false | undefined
}): boolean {
  if (args.pressScale === false || !args.actionable) return false
  return !args.styleIsFunction && !args.childrenIsFunction
}

/** Échelle au toucher par défaut : perceptible sans déformer la mise en page. */
export const DEFAULT_PRESS_SCALE = 0.97
