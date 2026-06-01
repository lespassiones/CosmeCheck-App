/**
 * Edge Function `deep-fetch` — port de `CosmetWiki/app/api/deep-fetch/route.ts`.
 *
 * Récupère une page web et lance l'extraction (GPT-4o-mini → Mistral) pour en
 * sortir la liste INCI. Appelé quand l'utilisateur clique un candidat de la
 * "recherche approfondie".
 *
 * Comme le web : route PUBLIQUE (pas d'auth), rate-limit IP léger (20/min) via
 * la RPC partagée, AUCUN crédit débité (le crédit a déjà été pris à l'étape
 * "Recherche approfondie"). Garde-fous techniques : timeout 8 s, check
 * content-type, jamais de HTML brut renvoyé, + garde SSRF (cibles internes
 * bloquées).
 *
 * Entrée : { url, label? } (POST body). Sortie : { ok, ingredientsText, sourceUrl }.
 */
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/auth.ts";
import { extractInciFromHtml, fetchPageHtml, isSafePublicUrl } from "./lib.ts";

type Body = { url?: string; label?: string };

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

  // Rate-limit IP : 20/min (un utilisateur qui essaie plusieurs candidats
  // successifs dépasse vite 6). Chaque extraction = 1 fetch HTTP + 1 LLM.
  const ip = getClientIp(req.headers);
  try {
    const svc = serviceClient();
    const { data: rateData } = await svc.rpc("cosme_check_check_rate_limit", {
      p_key: `deepfetch:${ip}`,
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
    // Si la RPC échoue, on n'empêche pas l'appel (best-effort comme le web).
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return jsonResponse({ error: "Requête invalide." }, { status: 400 });
  }

  const url = (body.url ?? "").trim();
  if (!url || !isSafePublicUrl(url)) {
    return jsonResponse({ error: "URL invalide." }, { status: 400 });
  }

  const html = await fetchPageHtml(url);
  if (!html) {
    return jsonResponse({ error: "Impossible de charger la page." }, { status: 502 });
  }

  const label = (body.label ?? "").slice(0, 200) || "produit cosmétique";
  const inci = await extractInciFromHtml({ label, html });
  if (!inci) {
    return jsonResponse({ error: "Composition introuvable sur cette page." }, { status: 404 });
  }

  return jsonResponse({ ok: true, ingredientsText: inci, sourceUrl: url });
});
