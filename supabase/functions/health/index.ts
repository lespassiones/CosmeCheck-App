/**
 * Edge Function `health` - smoke test de déploiement.
 *
 * - Gère le preflight OPTIONS (CORS).
 * - N'exige PAS l'auth : renvoie l'id utilisateur s'il y a un token valide,
 *   sinon `user: null` (pas d'erreur).
 * - Retourne {ok:true, ts, user}.
 *
 * Déploiement : `supabase functions deploy health`
 * Test mobile : `supabase.functions.invoke('health')` -> 200.
 */
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { getOptionalUser } from "../_shared/auth.ts";

Deno.serve(async (req: Request) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  let userId: string | null = null;
  try {
    const { user } = await getOptionalUser(req);
    userId = user?.id ?? null;
  } catch {
    userId = null;
  }

  return jsonResponse({
    ok: true,
    ts: new Date().toISOString(),
    user: userId,
  });
});
