// Orchestrates the product → INCI cascade. Port of CosmetWiki
// lib/productSearch/cascade.ts.
//
// Strategy:
//   0. Own catalog (cosme_check_search_catalog), sub-100 ms, no HTTP.
//   1. Cache (product_inci_cache RPC), re-validated against the query.
//   2. Fire OBF + INCIDecoder + DuckDuckGo+LLM in PARALLEL; first matching
//      hit (in priority order) wins. Latency = slowest source, not sum.
//
// SIMPLIFICATION vs web: the per-brand scrapers (laRochePosay, avene, …) are
// NOT ported. The generic DuckDuckGo+LLM step already covers brand sites (just
// without a `site:` filter), keeping each function dir self-contained. This is
// the "essential cascade" — same sources/order minus brand handlers.
//
// Whole cascade capped at 8 s → clean "not_found" instead of a gateway error.
import { normalizeQuery } from "./normalize.ts";
import { getProductCache, setProductCache } from "./cache.ts";
import { searchCatalogByName } from "./catalog.ts";
import { searchOpenBeautyFacts } from "./openBeautyFacts.ts";
import { searchInciDecoder } from "./inciDecoder.ts";
import { searchDuckDuckGo } from "./duckduckgo.ts";
import { matchesQuery } from "./relevance.ts";
import type { ProductSearchResult, ProductSource } from "./types.ts";

const NOT_FOUND_MESSAGE =
  "Nous n'avons pas pu trouver la composition de ce produit sur nos sources publiques. Tu peux coller la liste INCI manuellement ci-dessous.";

const CASCADE_TIMEOUT_MS = 8_000;

type HitData = {
  brand: string | null;
  productName: string | null;
  ingredientsText: string;
  sourceUrl: string;
};

type SourceAttempt = {
  name: string;
  sourceLabel: ProductSource;
  confidence: number;
  promise: Promise<HitData | null>;
};

export async function searchProductCascade(rawQuery: string): Promise<ProductSearchResult> {
  const startedAt = Date.now();
  return await Promise.race([
    runCascade(rawQuery, startedAt),
    new Promise<ProductSearchResult>((resolve) => {
      setTimeout(() => {
        resolve({ found: false, reason: "timeout", message: NOT_FOUND_MESSAGE });
      }, CASCADE_TIMEOUT_MS);
    }),
  ]);
}

async function runCascade(rawQuery: string, _startedAt: number): Promise<ProductSearchResult> {
  const query = rawQuery.trim().slice(0, 200);
  if (query.length < 3) {
    return {
      found: false,
      reason: "too_short",
      message: "Tape au moins 3 caractères (marque + nom du produit).",
    };
  }
  const queryNorm = normalizeQuery(query);
  if (queryNorm.length < 3) {
    return {
      found: false,
      reason: "too_short",
      message: "Tape au moins 3 caractères (marque + nom du produit).",
    };
  }

  // Step 0: own catalog.
  const catalogHit = await searchCatalogByName(query);
  if (catalogHit) {
    void setProductCache({
      queryNorm,
      brand: catalogHit.brand,
      productName: catalogHit.productName,
      ingredientsText: catalogHit.ingredientsText,
      source: "catalog",
      sourceUrl: null,
      confidence: 0.95,
    });
    return {
      found: true,
      brand: catalogHit.brand,
      productName: catalogHit.productName,
      ingredientsText: catalogHit.ingredientsText,
      source: "cache",
      sourceUrl: null,
      confidence: 0.95,
    };
  }

  // Step 1: cache, re-validated against the query.
  const cached = await getProductCache(queryNorm);
  if (cached) {
    const cachedLabel = `${cached.brand ?? ""} ${cached.product_name ?? ""}`;
    if (matchesQuery(query, cachedLabel)) {
      return {
        found: true,
        brand: cached.brand,
        productName: cached.product_name,
        ingredientsText: cached.ingredients_text,
        source: "cache",
        sourceUrl: cached.source_url,
        confidence: cached.confidence ?? 0.9,
      };
    }
  }

  // Step 2: OBF + INCIDecoder + DDG in parallel; first matching hit wins.
  const attempts: SourceAttempt[] = [
    {
      name: "openbeautyfacts",
      sourceLabel: "openbeautyfacts",
      confidence: 0.95,
      promise: searchOpenBeautyFacts(query),
    },
    {
      name: "incidecoder",
      sourceLabel: "incidecoder",
      confidence: 0.85,
      promise: searchInciDecoder(query),
    },
    {
      name: "duckduckgo+mistral",
      sourceLabel: "duckduckgo+mistral",
      confidence: 0.7,
      promise: searchDuckDuckGo(query),
    },
  ];

  const settled = await Promise.allSettled(attempts.map((a) => a.promise));

  for (let i = 0; i < attempts.length; i++) {
    const r = settled[i];
    const a = attempts[i]!;
    if (r.status !== "fulfilled" || r.value === null) continue;
    const label = `${r.value.brand ?? ""} ${r.value.productName ?? ""}`;
    if (!matchesQuery(query, label)) continue;

    const hit = r.value;
    void setProductCache({
      queryNorm,
      brand: hit.brand,
      productName: hit.productName,
      ingredientsText: hit.ingredientsText,
      source: a.sourceLabel,
      sourceUrl: hit.sourceUrl,
      confidence: a.confidence,
    });

    return {
      found: true,
      brand: hit.brand,
      productName: hit.productName,
      ingredientsText: hit.ingredientsText,
      source: a.sourceLabel,
      sourceUrl: hit.sourceUrl,
      confidence: a.confidence,
    };
  }

  return { found: false, reason: "not_found", message: NOT_FOUND_MESSAGE };
}
