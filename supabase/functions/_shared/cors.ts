/**
 * CORS headers partagés pour toutes les Edge Functions.
 *
 * Les apps mobiles ne sont pas soumises à la CORS du navigateur, mais on
 * garde des en-têtes permissifs pour : (a) le dev web / Expo web, (b) les
 * appels via `supabase.functions.invoke` qui transitent l'en-tête `apikey`
 * et `Authorization`, (c) les outils de test (curl, navigateur).
 */

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

/**
 * Gère la requête preflight OPTIONS. Retourne une `Response` 204 si la
 * méthode est OPTIONS, sinon `null` (le handler continue normalement).
 *
 *   const pre = handleOptions(req);
 *   if (pre) return pre;
 */
export function handleOptions(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 204, headers: corsHeaders });
  }
  return null;
}

/** Helper JSON qui ajoute systématiquement les en-têtes CORS. */
export function jsonResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}
