/**
 * Clé canonique des restrictions utilisateur.
 *
 * Sert à détecter si une synthèse stockée (figée dans `analyses.result_json.synthesis`)
 * a été générée avec un contexte de restrictions DIFFÉRENT des restrictions
 * ACTUELLES : si la clé stockée (`synthesisRestrictionsKey`) ne correspond plus,
 * la synthèse est périmée (ex. elle dit « X que tu as choisi d'éviter » alors que
 * le badge live affiche « aucune restriction ») → on la régénère.
 *
 * IMPORTANT : la logique doit être IDENTIQUE côté Edge `synthesis` (Deno) — toute
 * divergence ferait régénérer la synthèse à chaque ouverture. Voir
 * `supabase/functions/synthesis/index.ts` (fonction restrictionsKey).
 */
import type { UserRestrictions } from '@/lib/supabase/types'

export function restrictionsKey(r: UserRestrictions | null | undefined): string {
  const fams = (r?.families ?? [])
    .map((f) => (f ?? '').trim().toLowerCase())
    .filter((f) => f.length > 0)
    .sort()
  const ings = (r?.ingredients ?? [])
    .map((i) => ((i?.slug ?? i?.name) ?? '').trim().toLowerCase())
    .filter((s) => s.length > 0)
    .sort()
  return `${fams.join(',')}|${ings.join(',')}`
}
