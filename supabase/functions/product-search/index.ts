/**
 * Edge Function `product-search` — port of CosmetWiki
 * app/api/product-search/route.ts.
 *
 * Pipeline (mirrors web):
 *   1. gate (auth Bearer + IP rate-limit, costCredits:0 — search is free).
 *      Web rate-limit was 20/min/IP → rateMax:20, rateWindowSec:60.
 *   2. normalizeProductQuery (GPT pre-normalization). barcode → cascade with
 *      canonical barcode; candidates → return the list; query → refined query.
 *   3. searchProductCascade (catalog → cache → OBF/INCIDecoder/DDG+LLM).
 *   4. When the cascade misses, attach pre-validated web candidates
 *      (OpenAI web search, DDG fallback). "Voir plus" via `exclude`.
 *
 * Body: { query, exclude?, hp? }
 * Response: { ...ProductSearchResult, webCandidates, normalization }
 * Degrades without AI keys: normalization → unchanged, web candidates → [].
 */
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { gate } from "../_shared/gate.ts";
import { searchProductCascade } from "./lib/cascade.ts";
import { collectOpenAIWebCandidates } from "./lib/openaiSearch.ts";
import { collectDuckDuckGoCandidates } from "./lib/duckduckgo.ts";
import { prevalidateCandidates } from "./lib/prevalidate.ts";
import { normalizeProductQuery } from "./lib/productNormalize.ts";

const VALIDATED_TARGET = 8;
const FIRST_BATCH_LIMIT = 24;
const LOAD_MORE_LIMIT = 24;

type RequestBody = {
  query?: string;
  hp?: string;
  exclude?: string[];
};

Deno.serve(async (req: Request) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") {
    return jsonResponse({ error: "Méthode non autorisée." }, { status: 405 });
  }

  // Web order: IP rate-limit FIRST (429), then body parse (400), then honeypot
  // (403), then query validation (400). The gate bundles auth (mobile-only
  // addition) + the IP rate-limit; no credit charged (search is free in web).
  // Web used 20/min/IP.
  const g = await gate(req, {
    feature: "product_search",
    costCredits: 0,
    rateMax: 20,
    rateWindowSec: 60,
    rateLimitMessage: "Trop de recherches récentes. Patiente une minute.",
  });
  if (!g.ok) return g.response;
  const userId = g.user.id;

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return jsonResponse({ error: "Requête invalide." }, { status: 400 });
  }

  if (body.hp && body.hp.length > 0) {
    return jsonResponse({ error: "Forbidden" }, { status: 403 });
  }

  const query = (body.query ?? "").trim();
  if (query.length < 3) {
    return jsonResponse(
      { error: "Tape au moins 3 caractères (marque + nom du produit)." },
      { status: 400 },
    );
  }

  const norm = await normalizeProductQuery(query, userId);

  if (norm.kind === "barcode") {
    const result = await searchProductCascade(norm.barcode);
    return jsonResponse({ ...result, normalization: { kind: "barcode", value: norm.barcode } });
  }

  if (norm.kind === "candidates") {
    return jsonResponse({
      results: [],
      candidates: norm.candidates,
      reason: norm.reason,
      normalization: { kind: "candidates" },
    });
  }

  const refinedQuery = norm.kind === "query" ? norm.query : query;
  const exclude = Array.isArray(body.exclude)
    ? body.exclude.filter((e): e is string => typeof e === "string").slice(0, 30)
    : [];
  const isLoadMore = exclude.length > 0;

  // "Voir plus": skip the catalog cascade, go straight to web search + prevalidate.
  if (isLoadMore) {
    const raw = await collectOpenAIWebCandidates(refinedQuery, LOAD_MORE_LIMIT, exclude);
    const { validated } = await prevalidateCandidates(raw, VALIDATED_TARGET);
    return jsonResponse({
      found: false,
      reason: "load_more",
      webCandidates: validated,
      normalization: { kind: "load_more" },
    });
  }

  const result = await searchProductCascade(refinedQuery);

  let webCandidates: Awaited<ReturnType<typeof prevalidateCandidates>>["validated"] = [];
  if (!result.found) {
    let raw = await collectOpenAIWebCandidates(refinedQuery, FIRST_BATCH_LIMIT);
    if (raw.length === 0) {
      raw = await collectDuckDuckGoCandidates(refinedQuery, FIRST_BATCH_LIMIT);
    }
    const { validated } = await prevalidateCandidates(raw, VALIDATED_TARGET);
    webCandidates = validated;
  }

  return jsonResponse({
    ...result,
    webCandidates,
    normalization:
      norm.kind === "query"
        ? { kind: "query", original: query, refined: refinedQuery, confidence: norm.confidence }
        : { kind: "unchanged" },
  });
});
