/**
 * Edge Function `product-by-barcode` — catalog-only mode.
 *
 * Pipeline (zéro appel externe) :
 *   1. gate (auth Bearer + IP rate-limit, costCredits:0). 20/min/IP.
 *   2. Server gate: barcode must match /^\d{8,14}$/ (EAN-8..ITF-14).
 *   3. Cache KV Deno TTL 12h.
 *   4. Lookup EAN dans le catalog Cosme Check.
 *      - Trouvé avec INCI valide → found.
 *      - Trouvé sans INCI        → reason:"incomplete".
 *      - Inconnu                 → enregistre stub + reason:"registered".
 *
 * Body: { barcode, hp? }
 * Response: ProductSearchResult (found + brand/productName/ingredientsText/
 *   source/confidence, or found:false + reason/message).
 */
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { gate } from "../_shared/gate.ts";
import { getCatalogByEan, registerScannedBarcode } from "./lib/catalog.ts";
import { cacheBarcodeResult, getCachedBarcodeResult } from "./lib/barcodeCache.ts";

const BARCODE_RE = /^\d{8,14}$/;

const INCOMPLETE = {
  found: false as const,
  reason: "incomplete" as const,
  message: "Ce produit n'a pas encore été référencé dans notre base de données.",
};

const REGISTERED = {
  found: false as const,
  reason: "registered" as const,
  message: "Ce produit a été enregistré et sera référencé très prochainement sur Cosme Check.",
};

type RequestBody = { barcode?: string; hp?: string };

// INCI lists have many short comma-separated tokens. Marketing text has few
// commas and very long sentences. Threshold: ≥5 tokens, average length ≤80 chars.
// 80 is generous enough for long botanical INCI names like
// "Hippophae Rhamnoides (Sea Buckthorn) Seed Oil" (46 chars) while still
// blocking marketing paragraphs (typically >100 chars per comma-separated phrase).
function looksLikeInci(text: string): boolean {
  const tokens = text.split(/[,;]/).map((t) => t.trim()).filter(Boolean);
  if (tokens.length < 5) return false;
  const avgLen = tokens.reduce((s, t) => s + t.length, 0) / tokens.length;
  return avgLen <= 80;
}

Deno.serve(async (req: Request) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") {
    return jsonResponse({ error: "Méthode non autorisée." }, { status: 405 });
  }

  const g = await gate(req, {
    feature: "product_by_barcode",
    costCredits: 0,
    rateMax: 20,
    rateWindowSec: 60,
    rateLimitMessage: "Trop de scans récents. Patiente une minute.",
  });
  if (!g.ok) return g.response;

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return jsonResponse({ error: "Requête invalide." }, { status: 400 });
  }

  if (body.hp && body.hp.length > 0) {
    return jsonResponse({ error: "Forbidden" }, { status: 403 });
  }

  const barcode = (body.barcode ?? "").trim();
  if (!BARCODE_RE.test(barcode)) {
    return jsonResponse({ error: "Code-barres invalide." }, { status: 400 });
  }

  // Log the scan event (best-effort, awaited so the isolate doesn't get killed
  // before the insert lands). Feeds the admin "Scans code-barres" metric.
  try {
    await g.supabase.rpc("cosme_check_log_scan", { p_kind: "barcode", p_ean: barcode });
  } catch {
    /* analytics best-effort — never block a scan */
  }

  // Cache TTL 12h — évite un aller-retour DB pour les scans répétés.
  const cached = await getCachedBarcodeResult<Record<string, unknown>>(barcode);
  if (cached) {
    return jsonResponse(cached, { headers: { "X-Cache": "HIT" } });
  }

  // Lookup dans le catalog Cosme Check (source unique de vérité).
  const row = await getCatalogByEan(barcode);

  if (row && row.ingredients_text && looksLikeInci(row.ingredients_text)) {
    const payload = {
      found: true as const,
      brand: row.brand,
      productName: row.name,
      ingredientsText: row.ingredients_text,
      source: "catalog" as const,
      confidence: 1.0,
      // Aperçu INSTANTANÉ pour la carte de scan (haut d'analyse) — lu direct du
      // catalogue, aucune analyse lancée. L'analyse complète ne tourne qu'au tap
      // « Voir le produit ».
      preview: {
        ean: row.ean,
        brand: row.brand,
        name: row.name,
        category: row.category ?? null,
        score: typeof row.score === "number" ? row.score : null,
        scoreTone: row.score_tone ?? null,
        scoreLabel: row.score_label ?? null,
        countOrange: row.count_orange ?? 0,
        countRouge: row.count_rouge ?? 0,
        imageUrl: row.image_url ?? null,
      },
    };
    void cacheBarcodeResult(barcode, payload);
    return jsonResponse(payload);
  }

  if (row) {
    // EAN connu mais INCI manquant/insuffisant.
    void cacheBarcodeResult(barcode, INCOMPLETE);
    return jsonResponse(INCOMPLETE);
  }

  // EAN totalement inconnu → on l'enregistre pour enrichissement futur.
  // Pas de cache sur REGISTERED : l'INSERT est idempotent (ON CONFLICT DO NOTHING)
  // et on veut re-tenter à chaque scan si la précédente tentative a échoué.
  // IMPORTANT : on AWAIT l'INSERT. En fire-and-forget (void), le runtime tue
  // l'isolate après la réponse et l'écriture échoue souvent (~1 scan sur 3
  // persisté, constaté en prod). L'await garantit la persistance (~50 ms).
  await registerScannedBarcode(barcode);
  return jsonResponse(REGISTERED);
});
