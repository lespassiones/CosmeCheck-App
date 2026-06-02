/**
 * Edge Function `product-suggest` — port of CosmetWiki
 * app/api/product-suggest/route.ts (GET → POST for the mobile client).
 *
 * Pipeline (mirrors web):
 *   1. gate (auth Bearer + IP rate-limit, costCredits:0). Web: 30/min/IP.
 *   2. page 1 → normalizeProductQuery refines the catalog query (confidence
 *      ≥ 0.6). Catalog + cache fetched first; OBF/INCIDecoder only when the
 *      catalog is thin (< CATALOG_THRESHOLD) or page > 1.
 *   3. Merge catalog > cache > OBF > INCIDecoder, deduped on first 6 tokens.
 *   4. Web fallback (page 1, merged < threshold): OpenAI web search (DDG
 *      fallback), dedup vs catalogue, then prevalidate → clickable cards only.
 *
 * Body: { query, page?, hp? }
 * Response: { candidates, hasMore, page, webCandidates }
 * Degrades without AI keys: normalization → raw query, webCandidates → [].
 */
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { gate } from "../_shared/gate.ts";
import { searchOpenBeautyFactsList } from "./lib/openBeautyFacts.ts";
import { searchInciDecoderList } from "./lib/inciDecoder.ts";
import { collectDuckDuckGoCandidates } from "./lib/duckduckgo.ts";
import { collectOpenAIWebCandidates } from "./lib/openaiSearch.ts";
import { prevalidateCandidates } from "./lib/prevalidate.ts";
import { normalizeProductQuery } from "./lib/productNormalize.ts";
import { fetchCatalogCandidates } from "./lib/catalog.ts";
import { fetchCachedCandidates } from "./lib/cache.ts";
import type { ProductCandidate } from "./lib/types.ts";

const PAGE_SIZE = 24;
const CATALOG_LIMIT = 24;
const CATALOG_THRESHOLD = 8;
const CACHE_LIMIT = 16;
const INCIDECODER_LIMIT = 20;
const WEB_FALLBACK_THRESHOLD = 5;
const WEB_FALLBACK_LIMIT = 8;

type RequestBody = { query?: string; page?: number; hp?: string };

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Dedupe key: collapse on the first 6 sorted tokens to absorb wording diffs. */
function dedupeKey(brand: string | null, name: string | null): string {
  const all = `${brand ?? ""} ${name ?? ""}`;
  return normalize(all).split(/\s+/).filter(Boolean).sort().slice(0, 6).join(" ");
}

Deno.serve(async (req: Request) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") {
    return jsonResponse({ error: "Méthode non autorisée." }, { status: 405 });
  }

  // Web order: IP rate-limit FIRST (429), then honeypot (403), then query
  // validation (400). The gate bundles auth (mobile-only addition) + the IP
  // rate-limit; no credit charged. Web used 30/min/IP.
  const g = await gate(req, {
    feature: "product_suggest",
    costCredits: 0,
    rateMax: 30,
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

  const query = (body.query ?? "").trim().slice(0, 200);
  if (query.length < 3) {
    return jsonResponse({ error: "Tape au moins 3 caractères." }, { status: 400 });
  }

  const page = Math.max(1, Math.min(20, Math.floor(Number(body.page ?? 1) || 1)));
  const isFirstPage = page === 1;

  // Normalize the catalog query on page 1 (typos, case, word order).
  let catalogQuery = query;
  if (isFirstPage) {
    try {
      const norm = await normalizeProductQuery(query, userId);
      if (norm.kind === "query" && norm.confidence >= 0.6) {
        catalogQuery = norm.query;
      }
    } catch {
      // keep original query on failure
    }
  }

  const catalogP = isFirstPage
    ? fetchCatalogCandidates(catalogQuery, CATALOG_LIMIT)
    : Promise.resolve([] as ProductCandidate[]);
  const cacheP = isFirstPage
    ? fetchCachedCandidates(query, CACHE_LIMIT)
    : Promise.resolve([] as ProductCandidate[]);

  const [catalogRes, cacheRes] = await Promise.allSettled([catalogP, cacheP]);
  const catalog = catalogRes.status === "fulfilled" ? catalogRes.value : [];
  const cached = cacheRes.status === "fulfilled" ? cacheRes.value : [];

  const needFallback = catalog.length < CATALOG_THRESHOLD;

  const obfP = needFallback || !isFirstPage
    ? searchOpenBeautyFactsList(query, page, PAGE_SIZE)
    : Promise.resolve({ candidates: [] as ProductCandidate[], hasMore: false });
  const inciP = isFirstPage && needFallback
    ? fetchInciDecoderCandidates(query, INCIDECODER_LIMIT)
    : Promise.resolve([] as ProductCandidate[]);

  const [obfRes, inciRes] = await Promise.allSettled([obfP, inciP]);
  const obf = obfRes.status === "fulfilled" ? obfRes.value : { candidates: [], hasMore: false };
  const inci = inciRes.status === "fulfilled" ? inciRes.value : [];

  // Merge order: catalog > cache > OBF > INCIDecoder.
  const seen = new Set<string>();
  const merged: ProductCandidate[] = [];
  for (const list of [catalog, cached, obf.candidates, inci]) {
    for (const c of list) {
      const key = dedupeKey(c.brand, c.productName);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(c);
    }
  }

  // Web fallback when the catalogue is thin (page 1 only).
  let webCandidates: Awaited<ReturnType<typeof prevalidateCandidates>>["validated"] = [];
  if (isFirstPage && merged.length < WEB_FALLBACK_THRESHOLD) {
    try {
      let raw = await collectOpenAIWebCandidates(query, 16);
      if (raw.length === 0) {
        raw = await collectDuckDuckGoCandidates(query, 16);
      }
      const catalogueKeys = new Set(merged.map((c) => dedupeKey(c.brand, c.productName)));
      raw = raw.filter((w) => !catalogueKeys.has(dedupeKey(w.brand, w.productName ?? w.title)));
      const { validated } = await prevalidateCandidates(raw, WEB_FALLBACK_LIMIT);
      webCandidates = validated;
    } catch {
      webCandidates = [];
    }
  }

  return jsonResponse({
    candidates: merged,
    hasMore: obf.hasMore,
    page,
    webCandidates,
  });
});

async function fetchInciDecoderCandidates(
  query: string,
  limit: number,
): Promise<ProductCandidate[]> {
  try {
    const list = await searchInciDecoderList(query, limit);
    return list.map((c) => ({
      id: `incidecoder-${c.slug}`,
      brand: c.brand,
      productName: c.productName,
      ingredientsText: "", // lazy-loaded on click
      imageUrl: null,
      sourceUrl: c.sourceUrl,
      source: "incidecoder" as const,
      slug: c.slug,
    }));
  } catch {
    return [];
  }
}
