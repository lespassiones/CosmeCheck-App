/**
 * Pure — calcule le « contexte routine » utilisé par l'écran Compare.
 *
 * - `routineOverlapSlugs` : retourne l'ensemble des slugs INCI qui apparaissent
 *   déjà dans la routine de l'utilisateur, EN EXCLUANT les analyses qu'on est
 *   en train de comparer (sinon l'overlap est trivialement 100 %).
 * - `buildCompareBonASavoir` : génère les phrases « Bon à savoir » à afficher
 *   sous la comparaison (chevauchement routine, allergènes de parfum).
 *
 * Pas de hook ici : ces fonctions consomment des données déjà chargées par
 * `useRoutine()` côté UI.
 */

import { parseAnalyseResponse } from '../analysis/types'
import type { CompareSide } from './compare'

export interface RoutineOverlapItem {
  analysis: {
    id?: string | null
    result_json?: unknown
  } | null
}

/**
 * Extrait l'ensemble des slugs ingrédients présents dans la routine,
 * en filtrant les analyses listées dans `excludeIds`.
 */
export function routineOverlapSlugs(
  items: RoutineOverlapItem[] | null | undefined,
  excludeIds: string[],
): Set<string> {
  const slugs = new Set<string>()
  if (!items) return slugs
  const exclude = new Set(excludeIds)
  for (const it of items) {
    const a = it.analysis
    if (!a || !a.id || exclude.has(a.id)) continue
    const parsed = parseAnalyseResponse(a.result_json)
    if (!parsed) continue
    for (const ing of parsed.items) {
      if (ing.slug) slugs.add(ing.slug)
    }
  }
  return slugs
}

/**
 * Calcule les phrases factuelles « Bon à savoir ». La copie reste exactement
 * identique à ce qui était inline dans l'écran avant refactor.
 */
export function buildCompareBonASavoir(args: {
  a: CompareSide
  b: CompareSide
  routineSlugs: Set<string>
}): string[] {
  const { a, b, routineSlugs } = args
  const out: string[] = []
  const slugs = Array.from(routineSlugs)
  const aOverlap = slugs.filter((s) => a.result.items.some((i) => i.slug === s)).length
  const bOverlap = slugs.filter((s) => b.result.items.some((i) => i.slug === s)).length
  if (aOverlap >= 3) {
    out.push(
      `${aOverlap} ingrédients de **${a.name}** se retrouvent déjà dans d'autres produits de ta routine - exposition cumulée à surveiller.`,
    )
  }
  if (bOverlap >= 3) {
    out.push(
      `${bOverlap} ingrédients de **${b.name}** se retrouvent déjà dans d'autres produits de ta routine - exposition cumulée à surveiller.`,
    )
  }
  const allergensA = a.result.euFragranceAllergens?.total ?? 0
  const allergensB = b.result.euFragranceAllergens?.total ?? 0
  if (allergensA > 0 && allergensB === 0) {
    out.push(
      `**${a.name}** contient ${allergensA} allergène${allergensA > 1 ? 's' : ''} de parfum déclaré${allergensA > 1 ? 's' : ''} (UE) - à éviter en cas de peau réactive.`,
    )
  } else if (allergensB > 0 && allergensA === 0) {
    out.push(
      `**${b.name}** contient ${allergensB} allergène${allergensB > 1 ? 's' : ''} de parfum déclaré${allergensB > 1 ? 's' : ''} (UE) - à éviter en cas de peau réactive.`,
    )
  }
  return out
}
