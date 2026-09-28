/**
 * Relais en mémoire entre l'écran d'analyse et la page « Liste des
 * ingrédients » (/analyse/ingredients/[id]).
 *
 * L'écran d'analyse a déjà le résultat en main : il le dépose ici juste avant
 * d'ouvrir la page, qui l'affiche instantanément (pas de relecture AsyncStorage
 * ni réseau). Si le relais est vide (redémarrage, lien direct), la page relit
 * l'analyse elle-même.
 *
 * Borné à quelques entrées : seules les dernières analyses ouvertes servent.
 */

import type { AnalyseResponse } from '@/lib/analysis/types'

const MAX_ENTRIES = 3
const store = new Map<string, AnalyseResponse>()

export function putIngredientList(analysisId: string, result: AnalyseResponse): void {
  store.delete(analysisId)
  store.set(analysisId, result)
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value
    if (oldest === undefined) break
    store.delete(oldest)
  }
}

export function getIngredientList(analysisId: string): AnalyseResponse | null {
  return store.get(analysisId) ?? null
}
