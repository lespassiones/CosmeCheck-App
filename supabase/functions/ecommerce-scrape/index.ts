/**
 * Edge Function `ecommerce-scrape` — twin Deno de
 * `CosmetWiki/app/api/ecommerce-scrape/route.ts`.
 *
 * POST { url } → { productName, brand, description, ingredientsText, imageUrl,
 *                  sourceUrl, source: {metadata, inci, cached} }
 *
 * Pour la tile "Coller le lien" : un user colle une URL e-commerce, on extrait
 * en parallèle les métadonnées (JSON-LD/meta tags) ET l'INCI (LLM). Cache via
 * `cosme_check.ai_cache` → re-scan ou confirm-then-analyse round-trip = gratuit.
 *
 * - Route PUBLIQUE (pas d'auth) : la lecture d'URL ne touche pas aux données user
 * - Rate-limit IP 20/min (même budget que deep-fetch, même profil de coût)
 * - SSRF guard via validateUserUrl (refuse loopback / RFC1918 / metadata cloud)
 */
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/auth.ts";
import { scrapeEcommerceUrl, type EcommerceScrapeResult } from "./lib.ts";

interface Body {
  url?: string;
}

function getClientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "0.0.0.0";
}

type RateLimitResult =
  | { ok: true; remaining: number; reset_at: string }
  | { ok: false; remaining: 0; retry_after_ms: number };

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  // Rate-limit IP : 20/min (un user qui colle une URL puis confirme ne paie
  // qu'une seule fois grâce au cache, ce budget couvre ~20 produits distincts).
  const ip = getClientIp(req.headers);
  try {
    const svc = serviceClient();
    const { data: rateData } = await svc.rpc("cosme_check_check_rate_limit", {
      p_key: `urlscrape:${ip}`,
      p_max: 20,
      p_window_sec: 60,
    });
    const rate = (rateData ?? { ok: true, remaining: 20, reset_at: "" }) as RateLimitResult;
    if (!rate.ok) {
      const retrySec = Math.max(1, Math.ceil(rate.retry_after_ms / 1000));
      return jsonResponse(
        { error: "Trop de récupérations récentes. Patiente une minute." },
        { status: 429, headers: { "Retry-After": String(retrySec) } },
      );
    }
  } catch {
    // RPC indisponible → best-effort (comme le web)
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return jsonResponse({ error: "Requête invalide." }, { status: 400 });
  }

  const url = (body.url ?? "").trim();
  if (!url) {
    return jsonResponse({ error: "URL manquante." }, { status: 400 });
  }

  const result: EcommerceScrapeResult = await scrapeEcommerceUrl(url);
  if (!result.ok) {
    // Mapping reason → HTTP status (cohérent avec le web)
    const status =
      result.reason === "invalid_url"
        ? 400
        : result.reason === "not_found"
          ? 404
          : result.reason === "site_blocked"
            ? 451 // Unavailable for Legal Reasons
            : result.reason === "fetch_failed" || result.reason === "html_too_large"
              ? 502
              : 422;
    return jsonResponse(
      { error: result.message, reason: result.reason },
      { status },
    );
  }

  return jsonResponse(result);
});
