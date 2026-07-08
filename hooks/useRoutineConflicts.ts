/**
 * useRoutineConflicts — assemble la routine (useRoutine), le profil peau
 * (useProfile) et le référentiel des familles d'ingrédients
 * (useIngredientFamilies) en une liste ORDONNÉE et STABLE de conflits
 * déterministes (moteur `lib/routine/conflicts.ts`), plus le compteur de badge.
 *
 * QUOI :
 *   - Construit les `ConflictInput` à partir des lignes de routine : chaque
 *     `result_json` est parsé (parseAnalyseResponse) pour en tirer les items,
 *     le productType (détection solaire) et les allergènes UE ; le créneau vient
 *     de `routine_items.time_of_day`.
 *   - Mémoïse `detectConflicts(inputs, skin, restrictions, families)`.
 *   - Réconcilie le seen-store (reconcileSeenConflicts) dès que la donnée est
 *     prête : émet l'événement des NOUVEAUX conflits high pour le module
 *     notifications.
 *
 * 100 % local, gratuit, sans IA : le hook est safe à monter en permanence dans
 * l'onglet routine (le badge se met à jour tout seul).
 */
import { useEffect, useMemo } from 'react'

import { useRoutine } from '@/hooks/useRoutine'
import { useProfile } from '@/hooks/useProfile'
import { useIngredientFamilies } from '@/hooks/useIngredientFamilies'
import { parseAnalyseResponse } from '@/lib/analysis/types'
import {
  countBadgeConflicts,
  detectConflicts,
  type ConflictInput,
  type RoutineConflict,
  type TimeOfDay,
} from '@/lib/routine/conflicts'
import { reconcileSeenConflicts } from '@/lib/routine/conflictsSeen'

export interface UseRoutineConflictsResult {
  conflicts: RoutineConflict[]
  badgeCount: number
  /** Réutilisés pour la projection compacte envoyée à l'analyse IA approfondie. */
  inputs: ConflictInput[]
  /** routine + profil + familles chargés (badge masqué tant que false). */
  ready: boolean
}

/** Coerce défensif du créneau (le champ peut manquer selon l'état du merge). */
function coerceTimeOfDay(raw: unknown): TimeOfDay | null {
  return raw === 'morning' || raw === 'evening' || raw === 'both' ? raw : null
}

export function useRoutineConflicts(): UseRoutineConflictsResult {
  const { items, isLoading: routineLoading } = useRoutine()
  const { skin, restrictions, isLoading: profileLoading } = useProfile()
  const { data: families = [], isLoading: familiesLoading } = useIngredientFamilies()

  const inputs = useMemo<ConflictInput[]>(() => {
    const out: ConflictInput[] = []
    for (const item of items) {
      const analysis = item.analysis
      if (!analysis) continue
      const parsed = parseAnalyseResponse(analysis.result_json)
      if (!parsed) continue
      out.push({
        analysisId: analysis.id,
        name: analysis.name ?? analysis.product_label ?? 'Produit',
        timeOfDay: coerceTimeOfDay(item.time_of_day),
        frequency: item.frequency,
        category: analysis.category,
        categoryPrecise: analysis.category_precise,
        productType: parsed.productType ?? null,
        items: parsed.items,
        euAllergens: parsed.euFragranceAllergens ?? null,
      })
    }
    return out
  }, [items])

  const ready = !routineLoading && !profileLoading && !familiesLoading

  const conflicts = useMemo(
    () => detectConflicts(inputs, skin, restrictions, families),
    [inputs, skin, restrictions, families],
  )

  const badgeCount = useMemo(() => countBadgeConflicts(conflicts), [conflicts])

  // Dès que la donnée est prête : mémorise l'ensemble vu + notifie les nouveaux
  // conflits high (event DeviceEventEmitter consommé par le module notifications).
  useEffect(() => {
    if (!ready) return
    void reconcileSeenConflicts(conflicts)
  }, [conflicts, ready])

  return { conflicts, badgeCount, inputs, ready }
}
