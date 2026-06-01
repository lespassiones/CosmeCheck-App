/**
 * Authentification basée Bearer pour les Edge Functions.
 *
 * Contrairement au web (cookie-based, `lib/supabase.ts` -> supabaseServer),
 * le mobile détient un JWT Supabase qu'il envoie dans l'en-tête
 * `Authorization: Bearer <token>` (auto-attaché par `supabase.functions.invoke`).
 *
 * - `getUserFromRequest(req)` : extrait le Bearer, crée un client lié au token
 *   utilisateur (RLS appliquée comme cet utilisateur), appelle getUser().
 * - `serviceClient()` : client service-role pour les opérations privilégiées
 *   (logs, cache, upserts catalogue). Bypass RLS.
 * - `unauthorizedResponse()` : helper 401 prêt à retourner.
 */
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { corsHeaders } from "./cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

/** Extrait le token Bearer brut de la requête, ou null. */
export function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

/**
 * Crée un client Supabase lié au token utilisateur (RLS = cet utilisateur),
 * SANS valider le token. Utile quand on a déjà l'utilisateur ou pour les
 * appels où l'absence de token donne un client anonyme.
 */
export function userClient(token: string | null): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    },
  });
}

/** Client service-role (bypass RLS). Server-side only. */
export function serviceClient(): SupabaseClient {
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY missing - server only.");
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Réponse 401 standard (avec CORS). */
export function unauthorizedResponse(message = "Authentification requise."): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export type AuthOk = {
  ok: true;
  user: User;
  token: string;
  /** Client lié au token utilisateur (RLS appliquée). */
  supabase: SupabaseClient;
};

export type AuthErr = {
  ok: false;
  response: Response;
};

/**
 * Valide le Bearer et renvoie {user, supabase} ou une réponse 401.
 *
 *   const auth = await getUserFromRequest(req);
 *   if (!auth.ok) return auth.response;
 *   const { user, supabase } = auth;
 */
export async function getUserFromRequest(req: Request): Promise<AuthOk | AuthErr> {
  const token = getBearerToken(req);
  if (!token) {
    return { ok: false, response: unauthorizedResponse() };
  }

  const supabase = userClient(token);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return { ok: false, response: unauthorizedResponse() };
  }

  return { ok: true, user: data.user, token, supabase };
}

/**
 * Variante non-bloquante : renvoie l'utilisateur s'il y a un token valide,
 * sinon `null` (pas d'erreur). Utilisé par /health et les endpoints publics.
 */
export async function getOptionalUser(
  req: Request,
): Promise<{ user: User | null; token: string | null; supabase: SupabaseClient }> {
  const token = getBearerToken(req);
  const supabase = userClient(token);
  if (!token) return { user: null, token: null, supabase };
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return { user: null, token, supabase };
    return { user: data.user, token, supabase };
  } catch {
    return { user: null, token, supabase };
  }
}
