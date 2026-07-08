/**
 * Point d'entrée unique pour toute Edge Function protégée. Port de
 * `lib/apiGate.ts` (CosmetWiki web), adapté du modèle cookie -> Bearer.
 *
 * Dans l'ordre :
 *   1. Auth - utilisateur connecté requis (401 sinon), via auth.ts (Bearer).
 *   2. Rate-limit IP burst - RPC Postgres partagée (UNLOGGED table).
 *      RPC `cosme_check_check_rate_limit({ p_key, p_max, p_window_sec })`.
 *   3. Crédits - décrément atomique via RPC `cosme_check_consume_credit({ p_feature })`.
 *      1 crédit par appel par défaut ; `costCredits: 0` pour les endpoints
 *      gratuits (search, suggest, explain public…).
 *
 * Usage dans un handler :
 *   const g = await gate(req, { feature: "promesse.identify" });
 *   if (!g.ok) return g.response;
 *   const { user, supabase, consumeCredit } = g;
 */
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getUserFromRequest, serviceClient } from "./auth.ts";
import { corsHeaders } from "./cors.ts";

export type GateOptions = {
  /** Identifiant pour crédits/logs - ex. "promesse.identify". */
  feature: string;
  /** Défaut 1. Mettre 0 pour les endpoints peu coûteux (search, suggest…). */
  costCredits?: 0 | 1;
  /** Limite burst (IP, par minute). Défaut 30/min. */
  rateMax?: number;
  rateWindowSec?: number;
  /** Message 429 rate-limit spécifique (sinon message générique web). */
  rateLimitMessage?: string;
};

export type CreditsState = { used: number; limit: number; remaining: number };

export type GateOk = {
  ok: true;
  user: User;
  /** Client lié au token utilisateur (RLS appliquée). */
  supabase: SupabaseClient;
  credits: CreditsState;
  /**
   * Débite `count` crédit(s) (défaut 1) APRÈS avoir passé les early-exit
   * (typiquement après un lookup d'idempotence / un hit cache). Renvoie l'état
   * des crédits mis à jour, ou une réponse 429 prête à retourner.
   */
  consumeCredit: (
    feature: string,
    count?: number,
  ) => Promise<{ ok: true; credits: CreditsState } | { ok: false; response: Response }>;
};

export type GateErr = {
  ok: false;
  response: Response;
};

function getClientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "0.0.0.0";
}

function jsonError(
  body: unknown,
  status: number,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extraHeaders },
  });
}

export async function gate(req: Request, opts: GateOptions): Promise<GateOk | GateErr> {
  const headers = req.headers;

  // ── 1. Auth (Bearer) ────────────────────────────────────────────────────
  const auth = await getUserFromRequest(req);
  if (!auth.ok) return { ok: false, response: auth.response };
  const { user, supabase } = auth;

  // ── 2. Rate-limit IP burst (Postgres, partagé) ──────────────────────────
  const ip = getClientIp(headers);
  const rateMax = opts.rateMax ?? 30;
  const rateWindowSec = opts.rateWindowSec ?? 60;
  const svc = serviceClient();

  type RateLimitResult =
    | { ok: true; remaining: number; reset_at: string }
    | { ok: false; remaining: 0; retry_after_ms: number };

  const { data: rateData } = await svc.rpc("cosme_check_check_rate_limit", {
    p_key: `burst:${ip}`,
    p_max: rateMax,
    p_window_sec: rateWindowSec,
  });
  const rate = (rateData ?? { ok: true, remaining: rateMax, reset_at: "" }) as RateLimitResult;
  if (!rate.ok) {
    const retrySec = Math.max(1, Math.ceil(rate.retry_after_ms / 1000));
    return {
      ok: false,
      response: jsonError(
        { error: opts.rateLimitMessage ?? "Trop de requêtes. Réessaye dans un instant." },
        429,
        { "Retry-After": String(retrySec) },
      ),
    };
  }

  // ── 3. Crédits ───────────────────────────────────────────────────────────
  type ConsumeResult =
    | { ok: true; used: number; limit: number; remaining: number }
    | { ok: false; used?: number; limit?: number; remaining?: number; error?: string };

  const chargeCredit = async (
    feature: string,
    count = 1,
  ): Promise<{ ok: true; credits: CreditsState } | { ok: false; response: Response }> => {
    const { data: creditData } = await supabase.rpc("cosme_check_consume_credit", {
      p_feature: feature,
      p_count: count,
    });
    const consume = (creditData ?? { ok: false, error: "no_response" }) as ConsumeResult;
    if (!consume.ok) {
      const used = consume.used ?? 0;
      const limit = consume.limit ?? 100;
      return {
        ok: false,
        response: jsonError(
          {
            error: "Tu as utilisé tous tes crédits du jour. Reviens demain.",
            code: "no_credits",
            credits: { used, limit, remaining: 0 },
          },
          429,
          { "Retry-After": "86400", "X-Credits-Remaining": "0" },
        ),
      };
    }
    return {
      ok: true,
      credits: { used: consume.used, limit: consume.limit, remaining: consume.remaining },
    };
  };

  let credits: CreditsState = { used: 0, limit: 100, remaining: 100 };
  if ((opts.costCredits ?? 1) > 0) {
    const charge = await chargeCredit(opts.feature);
    if (!charge.ok) return { ok: false, response: charge.response };
    credits = charge.credits;
  }

  return { ok: true, user, supabase, credits, consumeCredit: chargeCredit };
}
