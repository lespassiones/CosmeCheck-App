/**
 * Pure — résumé "routine" utilisé par le dashboard (carte « Ta routine »).
 *
 * Cumule les compteurs ingrédients (vert/jaune/orange/rouge) à partir des
 * `result_json` des analyses jointes à chaque produit de la routine. Permet
 * de DÉRIVER ce résumé du cache react-query `['routine', userId]` au lieu
 * d'une 2e requête Supabase.
 */

import { parseAnalyseResponse } from '../analysis/types'

export interface RoutineBlobCounts {
  vert: number
  jaune: number
  orange: number
  rouge: number
}

export interface RoutineSummary {
  count: number
  counts: RoutineBlobCounts
}

export interface RoutineSummaryInput {
  analysis: { result_json: unknown } | null
}

export const EMPTY_COUNTS: RoutineBlobCounts = { vert: 0, jaune: 0, orange: 0, rouge: 0 }

export function summarizeRoutine(
  items: RoutineSummaryInput[] | null | undefined,
): RoutineSummary {
  const counts: RoutineBlobCounts = { ...EMPTY_COUNTS }
  if (!items || items.length === 0) {
    return { count: 0, counts }
  }
  for (const item of items) {
    const parsed = parseAnalyseResponse(item.analysis?.result_json)
    if (!parsed) continue
    counts.vert += safeCount(parsed.counts.vert)
    counts.jaune += safeCount(parsed.counts.jaune)
    counts.orange += safeCount(parsed.counts.orange)
    counts.rouge += safeCount(parsed.counts.rouge)
  }
  return { count: items.length, counts }
}

function safeCount(n: unknown): number {
  return typeof n === 'number' && Number.isFinite(n) ? n : 0
}
