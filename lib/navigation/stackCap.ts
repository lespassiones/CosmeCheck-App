/**
 * Plafond de la pile d'écrans (module PUR, testé en node).
 *
 * POURQUOI : fiche d'analyse → alternatives → fiche d'analyse → … pouvait empiler
 * des écrans sans fin (chaque alternative touchée en ajoutait un). Au-delà de
 * MAX_SCREENS_ABOVE_TABS écrans au-dessus des onglets, le nouvel écran REMPLACE
 * celui du dessus au lieu de s'ajouter : la pile ne grandit plus, le retour
 * reste naturel (il saute seulement l'écran remplacé).
 */

export const MAX_SCREENS_ABOVE_TABS = 6

/** Forme minimale d'un état React Navigation (celui de getRootState()). */
export interface NavStateLike {
  index?: number
  routes: { name: string; state?: NavStateLike | Record<string, unknown> }[]
}

function isNavState(v: unknown): v is NavStateLike {
  return !!v && typeof v === 'object' && Array.isArray((v as NavStateLike).routes)
}

/**
 * Nombre d'écrans empilés AU-DESSUS des onglets, dans la pile qui contient
 * l'entrée « (tabs) » (cherchée aussi dans les navigateurs imbriqués).
 * 0 si l'état est inconnu ou si les onglets sont au sommet.
 */
export function screensAboveTabs(state: unknown): number {
  if (!isNavState(state)) return 0
  const tabsIdx = state.routes.findIndex((r) => r.name === '(tabs)')
  if (tabsIdx >= 0) {
    const top = typeof state.index === 'number' ? state.index : state.routes.length - 1
    return Math.max(0, top - tabsIdx)
  }
  for (const r of state.routes) {
    const n = screensAboveTabs(r.state)
    if (n > 0) return n
  }
  return 0
}

/** Vrai si le prochain écran doit remplacer le sommet au lieu de s'empiler. */
export function shouldReplaceOnPush(state: unknown, max: number = MAX_SCREENS_ABOVE_TABS): boolean {
  return screensAboveTabs(state) >= max
}
