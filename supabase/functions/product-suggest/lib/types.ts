// Shared types for the product search cascade (port of CosmetWiki
// lib/productSearch/types.ts).

export type ProductSource =
  | "cache"
  | "openbeautyfacts"
  | "openproductsfacts"
  | "incidecoder"
  | "duckduckgo+mistral"
  | "web_search"
  | `brand:${string}`;

export type ProductSearchHit = {
  found: true;
  brand: string | null;
  productName: string | null;
  ingredientsText: string;
  source: ProductSource;
  sourceUrl: string | null;
  confidence: number;
};

export type ProductSearchMiss = {
  found: false;
  reason: "too_short" | "not_found" | "timeout";
  message: string;
};

export type ProductSearchResult = ProductSearchHit | ProductSearchMiss;

/** A product candidate for the disambiguation list (OBF / catalog / cache /
 *  INCIDecoder). Mirrors CosmetWiki OpenBeautyFactsCandidate. */
export type ProductCandidate = {
  id: string;
  brand: string | null;
  productName: string | null;
  ingredientsText: string;
  imageUrl: string | null;
  sourceUrl: string;
  source?: "openbeautyfacts" | "cache" | "incidecoder" | "catalog";
  slug?: string;
  ean?: string | null;
  score?: number | null;
  scoreLabel?: string | null;
  scoreTone?: string | null;
};

/** A web-search candidate (OpenAI web search or DuckDuckGo HTML scrape). */
export type WebCandidate = {
  url: string;
  title: string;
  domain: string;
  brand: string | null;
  productName: string | null;
  ingredientsText?: string;
};

export type PrevalidatedCandidate = WebCandidate & {
  /** INCI extracted during pre-validation; reusable client-side. */
  ingredientsText: string;
};
