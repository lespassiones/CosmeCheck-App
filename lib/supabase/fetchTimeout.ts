/**
 * Plafond de durée par défaut des requêtes Supabase.
 *
 * POURQUOI : sur Android, le client HTTP de React Native n'a AUCUN délai de
 * lecture (OkHttp readTimeout 0, voir commit f8b299f) ; sur iOS c'est ~60 s.
 * Une Edge Function ou une RPC qui ne répond pas laissait donc un chargement
 * sans fin (scan code-barres verrouillé, fiche ingrédient, carte compatibilité,
 * feuille Promesses…). Ici, toute requête SANS signal d'annulation reçoit un
 * plafond : l'appel échoue proprement et chaque écran affiche son erreur.
 *
 * Les appels qui ont déjà leur propre délai (`timeout` de functions.invoke,
 * `signal` de l'analyse) gardent le leur. L'authentification n'est jamais
 * coupée (rafraîchissement du jeton).
 */

/** Edge Functions : IA comprise (parité avec le délai iOS). */
export const FUNCTIONS_TIMEOUT_MS = 60_000
/**
 * Fonctions qui enchaînent plusieurs appels IA (coherence-analyze : budgets
 * 30+25+20+15+10 s ; identification de promesse par recherche web). À passer
 * en `timeout` explicite : au-delà de 60 s le client abandonnait alors que le
 * serveur finissait et débitait le crédit.
 */
export const LONG_AI_TIMEOUT_MS = 120_000
/** PostgREST (tables et RPC) : réponses courtes attendues. */
export const REST_TIMEOUT_MS = 30_000
/**
 * Révocation de session à la déconnexion : courte, car en cas d'échec
 * `useAuth.signOut` retombe sur une déconnexion locale (le bouton ne doit pas
 * sembler mort sur un réseau muet).
 */
export const LOGOUT_TIMEOUT_MS = 8_000

/** Plafond à appliquer à une URL, ou null pour la laisser telle quelle. */
export function defaultTimeoutFor(url: string): number | null {
  if (url.includes('/functions/v1/')) return FUNCTIONS_TIMEOUT_MS
  if (url.includes('/rest/v1/')) return REST_TIMEOUT_MS
  if (url.includes('/auth/v1/logout')) return LOGOUT_TIMEOUT_MS
  return null
}

type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return (input as Request).url ?? ''
}

export function withDefaultTimeout(baseFetch: FetchFn): FetchFn {
  return (input, init) => {
    const ms = defaultTimeoutFor(urlOf(input))
    if (ms == null || init?.signal) return baseFetch(input, init)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), ms)
    return baseFetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer))
  }
}
