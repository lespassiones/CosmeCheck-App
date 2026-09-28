/**
 * Refus « plus de crédits » d'une Edge Function : la règle, en logique pure.
 *
 * Un 429 ne veut PAS toujours dire « crédits épuisés » : le rate-limit IP du
 * `gate` (_shared/gate.ts) répond aussi 429, mais sans `code` ni `credits`.
 * Avant le 28/09/2026, plusieurs écrans ouvraient la feuille « Plus de
 * crédits » sur un simple « trop de requêtes ».
 *
 * Refus de crédits = 429 avec `code: 'no_credits'` (gate, advisor, compare…)
 * OU avec un bloc `credits` (synthesis, personal-insights n'ont pas de `code`).
 */

export interface CreditsInfo {
  used?: number
  limit?: number
}

export function isNoCreditsRefusal(status: number | null | undefined, body: unknown): boolean {
  if (status !== 429 || !body || typeof body !== 'object') return false
  const b = body as { code?: unknown; credits?: unknown }
  return b.code === 'no_credits' || (typeof b.credits === 'object' && b.credits !== null)
}

/** `{ used, limit }` du corps d'un refus, champs absents s'ils sont illisibles. */
export function creditsFromBody(body: unknown): CreditsInfo {
  const c = (body as { credits?: { used?: unknown; limit?: unknown } } | null)?.credits
  return {
    used: typeof c?.used === 'number' ? c.used : undefined,
    limit: typeof c?.limit === 'number' ? c.limit : undefined,
  }
}
