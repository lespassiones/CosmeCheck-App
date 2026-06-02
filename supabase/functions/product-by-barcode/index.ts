/**
 * Edge Function `product-by-barcode` — port of CosmetWiki
 * app/api/product-by-barcode/route.ts.
 *
 * Pipeline (mirrors web):
 *   1. gate (auth Bearer + IP rate-limit, costCredits:0). Web: 20/min/IP.
 *   2. Server gate: barcode must match /^\d{8,14}$/ (EAN-8..ITF-14).
 *   3. OBF + OPF v2 in PARALLEL → first with INCI ≥ 30 chars wins (OBF prio).
 *      When INCI looks like a real list, upsert catalog (fire-and-forget).
 *   4. If a source has a name but no INCI → name cascade; on hit, prefer the
 *      barcode-DB brand/name. On a DB-only miss → not_found with the name.
 *   5. Both OBF/OPF unknown → web search (OpenAI) last resort, then upsert.
 *   6. Else → NOT_FOUND.
 *
 * Body: { barcode, hp? }
 * Response: ProductSearchResult (found + brand/productName/ingredientsText/
 *   source/sourceUrl/confidence, or found:false + reason/message).
 * Degrades without AI keys: steps using the cascade/web search return misses.
 */
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { gate } from "../_shared/gate.ts";
import { fetchOFFProduct } from "./lib/openBeautyFacts.ts";
import { upsertCatalogProduct } from "./lib/catalog.ts";
import { searchProductCascade } from "./lib/cascade.ts";
import { searchProductByBarcode } from "./lib/barcodeWebSearch.ts";
import { cacheBarcodeResult, getCachedBarcodeResult } from "./lib/barcodeCache.ts";

const BARCODE_RE = /^\d{8,14}$/;

const NOT_FOUND = {
  found: false as const,
  reason: "not_found" as const,
  message:
    "Code-barres non référencé sur nos sources publiques. Tape le nom du produit ou colle sa liste INCI.",
};

type RequestBody = { barcode?: string; hp?: string };

// INCI lists have many short comma-separated tokens. Marketing text has few
// commas and long sentences. Threshold: ≥5 tokens, average length ≤40 chars.
function looksLikeInci(text: string): boolean {
  const tokens = text.split(/[,;]/).map((t) => t.trim()).filter(Boolean);
  if (tokens.length < 5) return false;
  const avgLen = tokens.reduce((s, t) => s + t.length, 0) / tokens.length;
  return avgLen <= 40;
}

Deno.serve(async (req: Request) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") {
    return jsonResponse({ error: "Méthode non autorisée." }, { status: 405 });
  }

  // Web order: IP rate-limit FIRST (429), then body parse (400), then honeypot
  // (403), then input validation (400). The gate bundles auth (mobile-only
  // addition) + the IP rate-limit; web used 20/min/IP.
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

  // 0. Cache TTL 12h (KV Deno) — un même code-barres scanné plusieurs fois
  // par jour évite 2 fetchs externes (OBF + OPF) qui prennent ~500ms chacun.
  const cached = await getCachedBarcodeResult<Record<string, unknown>>(barcode);
  if (cached) {
    return jsonResponse(cached, { headers: { "X-Cache": "HIT" } });
  }

  // 1. OBF + OPF in parallel — first with INCI ≥ 30 chars (OBF priority).
  const [obfResult, opfResult] = await Promise.allSettled([
    fetchOFFProduct("world.openbeautyfacts.org", barcode),
    fetchOFFProduct("world.openproductsfacts.org", barcode),
  ]);
  const obf = obfResult.status === "fulfilled" ? obfResult.value : null;
  const opf = opfResult.status === "fulfilled" ? opfResult.value : null;

  if (obf && obf.inci.length >= 30) {
    if (looksLikeInci(obf.inci)) {
      void upsertCatalogProduct({
        ean: barcode,
        brand: obf.brand,
        name: obf.name,
        ingredientsText: obf.inci,
        sourceUrl: obf.sourceUrl,
      });
    }
    const payload = {
      found: true,
      brand: obf.brand,
      productName: obf.name,
      ingredientsText: obf.inci,
      source: "openbeautyfacts",
      sourceUrl: obf.sourceUrl,
      confidence: 0.98,
    };
    void cacheBarcodeResult(barcode, payload);
    return jsonResponse(payload);
  }

  if (opf && opf.inci.length >= 30) {
    if (looksLikeInci(opf.inci)) {
      void upsertCatalogProduct({
        ean: barcode,
        brand: opf.brand,
        name: opf.name,
        ingredientsText: opf.inci,
        sourceUrl: opf.sourceUrl,
      });
    }
    const payload = {
      found: true,
      brand: opf.brand,
      productName: opf.name,
      ingredientsText: opf.inci,
      source: "openproductsfacts",
      sourceUrl: opf.sourceUrl,
      confidence: 0.95,
    };
    void cacheBarcodeResult(barcode, payload);
    return jsonResponse(payload);
  }

  // 2. One source has a name but no INCI → cascade by name.
  const partial = obf?.name ? obf : opf?.name ? opf : null;
  if (partial?.name) {
    const nameQuery = [partial.brand, partial.name].filter(Boolean).join(" ").trim();
    const cascadeResult = await searchProductCascade(nameQuery);
    if (cascadeResult.found) {
      if (looksLikeInci(cascadeResult.ingredientsText)) {
        void upsertCatalogProduct({
          ean: barcode,
          brand: cascadeResult.brand ?? partial.brand,
          name: cascadeResult.productName ?? partial.name,
          ingredientsText: cascadeResult.ingredientsText,
          sourceUrl: cascadeResult.sourceUrl ?? partial.sourceUrl,
        });
      }
      const payload = {
        ...cascadeResult,
        brand: cascadeResult.brand ?? partial.brand,
        productName: cascadeResult.productName ?? partial.name,
      };
      void cacheBarcodeResult(barcode, payload);
      return jsonResponse(payload);
    }
    return jsonResponse({
      found: false,
      reason: "not_found",
      message: `Produit identifié (${partial.name}) mais sans liste INCI exploitable sur nos sources. Colle la liste INCI du packaging.`,
    });
  }

  // 3. Barcode unknown to OBF + OPF → web search last resort.
  const webResult = await searchProductByBarcode(barcode);
  if (webResult.found) {
    if (looksLikeInci(webResult.ingredientsText)) {
      void upsertCatalogProduct({
        ean: barcode,
        brand: webResult.brand,
        name: webResult.productName,
        ingredientsText: webResult.ingredientsText,
        sourceUrl: webResult.sourceUrl,
      });
    }
    const payload = {
      found: true,
      brand: webResult.brand,
      productName: webResult.productName,
      ingredientsText: webResult.ingredientsText,
      source: "web_search",
      sourceUrl: webResult.sourceUrl,
      confidence: webResult.confidence,
    };
    void cacheBarcodeResult(barcode, payload);
    return jsonResponse(payload);
  }

  // 4. Unknown across all sources. On cache aussi un NOT_FOUND avec TTL court
  // (TTL_MS de la fonction reste à 12h ; le NOT_FOUND laisse à l'utilisateur
  // la possibilité de coller l'INCI manuellement).
  void cacheBarcodeResult(barcode, NOT_FOUND);
  return jsonResponse(NOT_FOUND);
});
