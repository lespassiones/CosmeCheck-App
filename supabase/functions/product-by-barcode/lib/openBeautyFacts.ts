// Open Beauty Facts client. Free, structured JSON, no scraping required.
// Port of CosmetWiki lib/productSearch/openBeautyFacts.ts.
import { matchesQuery } from "./relevance.ts";
import type { ProductCandidate } from "./types.ts";

const SEARCH_ENDPOINT = "https://world.openbeautyfacts.org/cgi/search.pl";
const UA = "Cosme-Check/1.0 (https://cosme-check.vercel.app)";

type OBFProduct = {
  product_name?: string;
  product_name_fr?: string;
  product_name_en?: string;
  brands?: string;
  ingredients_text?: string;
  ingredients_text_fr?: string;
  ingredients_text_en?: string;
  code?: string;
  image_front_small_url?: string;
  image_front_url?: string;
  image_small_url?: string;
  image_url?: string;
};

function pickImage(p: OBFProduct): string | null {
  return (
    p.image_front_small_url || p.image_small_url || p.image_front_url || p.image_url || null
  );
}

function pickName(p: OBFProduct): string | null {
  return p.product_name_fr || p.product_name || p.product_name_en || null;
}

function pickIngredients(p: OBFProduct): string | null {
  const txt = p.ingredients_text_fr || p.ingredients_text || p.ingredients_text_en || "";
  return txt.length > 30 ? txt : null;
}

export async function searchOpenBeautyFacts(query: string): Promise<{
  brand: string | null;
  productName: string | null;
  ingredientsText: string;
  sourceUrl: string;
} | null> {
  const url =
    `${SEARCH_ENDPOINT}?search_terms=${encodeURIComponent(query)}` +
    `&search_simple=1&action=process&json=1&page_size=10`;
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!r.ok) return null;
    const json = (await r.json()) as { products?: OBFProduct[] };
    const products = (json.products ?? []).filter((p) => pickIngredients(p) !== null);
    if (products.length === 0) return null;

    const best = products.find((p) => {
      const label = `${p.brands ?? ""} ${pickName(p) ?? ""}`;
      return matchesQuery(query, label);
    });
    if (!best) return null;

    const ingredientsText = pickIngredients(best)!;
    return {
      brand: best.brands ?? null,
      productName: pickName(best),
      ingredientsText,
      sourceUrl: best.code
        ? `https://world.openbeautyfacts.org/product/${best.code}`
        : url,
    };
  } catch {
    return null;
  }
}

/** Paginated list of OBF candidates that already have a usable INCI list. */
export async function searchOpenBeautyFactsList(
  query: string,
  page = 1,
  pageSize = 10,
): Promise<{ candidates: ProductCandidate[]; hasMore: boolean }> {
  const url =
    `${SEARCH_ENDPOINT}?search_terms=${encodeURIComponent(query)}` +
    `&search_simple=1&action=process&json=1&page_size=${pageSize}&page=${page}`;
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!r.ok) return { candidates: [], hasMore: false };
    const json = (await r.json()) as {
      products?: OBFProduct[];
      count?: number;
    };
    const products = json.products ?? [];

    const candidates: ProductCandidate[] = [];
    for (const p of products) {
      const ingredientsText = pickIngredients(p);
      if (!ingredientsText) continue;
      const label = `${p.brands ?? ""} ${pickName(p) ?? ""}`;
      if (!matchesQuery(query, label)) continue;
      candidates.push({
        id: p.code || `${label}-${candidates.length}`,
        brand: p.brands ?? null,
        productName: pickName(p),
        ingredientsText,
        imageUrl: pickImage(p),
        sourceUrl: p.code
          ? `https://world.openbeautyfacts.org/product/${p.code}`
          : url,
        source: "openbeautyfacts",
        ean: p.code ?? null,
      });
    }

    const total = json.count ?? 0;
    const hasMore = page * pageSize < total;
    return { candidates, hasMore };
  } catch {
    return { candidates: [], hasMore: false };
  }
}

export type OFFProduct = {
  name: string | null;
  brand: string | null;
  inci: string;
  sourceUrl: string;
  imageUrl: string | null;
};

type OBFV2Response = {
  status: 0 | 1;
  product?: {
    code?: string;
    product_name?: string;
    product_name_fr?: string;
    product_name_en?: string;
    brands?: string;
    ingredients_text?: string;
    ingredients_text_fr?: string;
    ingredients_text_en?: string;
    image_front_small_url?: string;
    image_front_url?: string;
    image_small_url?: string;
    image_url?: string;
  };
};

/** v2 product lookup by barcode against any Open*Facts domain (OBF/OPF share
 *  the same API). Used by the barcode endpoint. */
export async function fetchOFFProduct(
  domain: string,
  barcode: string,
): Promise<OFFProduct | null> {
  try {
    const r = await fetch(`https://${domain}/api/v2/product/${barcode}.json`, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!r.ok) return null;
    const data = (await r.json()) as OBFV2Response;
    if (data.status !== 1 || !data.product) return null;
    const p = data.product;
    const name = p.product_name_fr || p.product_name || p.product_name_en || null;
    const inci = p.ingredients_text_fr || p.ingredients_text || p.ingredients_text_en || "";
    const imageUrl =
      p.image_front_small_url || p.image_small_url || p.image_front_url || p.image_url || null;
    return {
      name,
      brand: p.brands ?? null,
      inci,
      sourceUrl: `https://${domain}/product/${barcode}`,
      imageUrl,
    };
  } catch {
    return null;
  }
}
