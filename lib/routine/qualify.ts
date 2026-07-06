/**
 * Règle de sélection des « Suggestions intelligentes » (routine) — logique PURE,
 * partagée/testée. À GARDER STRICTEMENT EN PHASE avec l'Edge Function
 * `supabase/functions/routine-smart-suggest/index.ts` (fonction
 * `qualifiesForSuggestion`), qui est l'autorité finale côté serveur.
 *
 * Un produit de la routine reçoit une suggestion si :
 *   1. il contient au moins un ingrédient ORANGE ou ROUGE → toujours (obligatoire) ;
 *   2. sinon, s'il contient un ingrédient RESTREINT par l'utilisateur → toujours ;
 *   3. sinon (uniquement vert/jaune) → seulement si le nombre de JAUNE > nombre de VERT.
 *
 * Autrement dit : vert ≥ jaune, aucun orange/rouge, aucune restriction → déjà bon,
 * pas de suggestion.
 */

export type SuggestCounts = {
  vert: number
  jaune: number
  orange: number
  rouge: number
}

/** Vrai si ce produit doit recevoir une suggestion d'alternative. */
export function qualifiesForSuggestion(
  counts: SuggestCounts,
  restrictedCount = 0,
): boolean {
  const orange = counts.orange ?? 0
  const rouge = counts.rouge ?? 0
  const jaune = counts.jaune ?? 0
  const vert = counts.vert ?? 0

  // 1. Orange ou rouge → obligatoire.
  if (orange > 0 || rouge > 0) return true
  // 2. Ingrédient restreint → toujours (même si le produit est vert).
  if ((restrictedCount ?? 0) > 0) return true
  // 3. Uniquement vert/jaune : suggestion seulement si le jaune domine.
  return jaune > vert
}

/**
 * Sévérité (tri : les plus pénalisants d'abord). Miroir de l'Edge Function.
 * Restriction >> rouge >> orange >> score bas.
 */
export function suggestionSeverity(
  counts: SuggestCounts,
  restrictedCount: number,
  cappedScore: number,
): number {
  return (
    (restrictedCount > 0 ? 1000 : 0) +
    (counts.rouge ?? 0) * 40 +
    (counts.orange ?? 0) * 15 +
    Math.max(0, 20 - (cappedScore ?? 20))
  )
}
