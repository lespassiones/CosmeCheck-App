// Read/write the product_inci_cache table via SECURITY DEFINER RPCs, plus a
// direct ilike lookup for the suggest disambiguation list. Ports of CosmetWiki
// lib/productSearch/cache.ts + the inline fetchCachedCandidates in
// app/api/product-suggest/route.ts. All access is service-role; every path
// degrades to null/[] on error (the cache is best-effort).
import { serviceClient } from "../../_shared/auth.ts";
import type { ProductCandidate } from "./types.ts";

type CacheRow = {
  query_norm: string;
  brand: string | null;
  product_name: string | null;
  ingredients_text: string;
  source: string;
  source_url: string | null;
  confidence: number | null;
};

export async function getProductCache(queryNorm: string): Promise<CacheRow | null> {
  try {
    const { data, error } = await serviceClient().rpc("cosme_check_get_product_cache", {
      p_query_norm: queryNorm,
    });
    if (error) return null;
    if (!data || (Array.isArray(data) && data.length === 0)) return null;
    const row = Array.isArray(data) ? data[0] : data;
    return row as CacheRow;
  } catch {
    return null;
  }
}

export async function setProductCache(input: {
  queryNorm: string;
  brand: string | null;
  productName: string | null;
  ingredientsText: string;
  source: string;
  sourceUrl: string | null;
  confidence: number;
}): Promise<void> {
  try {
    await serviceClient().rpc("cosme_check_set_product_cache", {
      p_query_norm: input.queryNorm,
      p_brand: input.brand,
      p_product_name: input.productName,
      p_ingredients_text: input.ingredientsText,
      p_source: input.source,
      p_source_url: input.sourceUrl,
      p_confidence: input.confidence,
    });
  } catch (err) {
    console.warn("[productSearch] cache write failed:", err);
  }
}

/** Cached candidates for the suggest disambiguation list — direct ilike scan
 *  of product_inci_cache (brand / product_name / query_norm). */
export async function fetchCachedCandidates(
  query: string,
  limit: number,
): Promise<ProductCandidate[]> {
  try {
    const like = `%${query.replace(/[%_]/g, "")}%`;
    const { data, error } = await serviceClient()
      .schema("cosme_check")
      .from("product_inci_cache")
      .select("id, brand, product_name, ingredients_text, source, source_url")
      .or(`brand.ilike.${like},product_name.ilike.${like},query_norm.ilike.${like}`)
      .limit(limit);
    if (error || !data) return [];
    return (data as Array<{
      id: number | string;
      brand: string | null;
      product_name: string | null;
      ingredients_text: string | null;
      source: string | null;
      source_url: string | null;
    }>).map((r) => ({
      id: `cache-${r.id}`,
      brand: r.brand,
      productName: r.product_name,
      ingredientsText: r.ingredients_text ?? "",
      imageUrl: null,
      sourceUrl: r.source_url ?? "",
      source: "cache" as const,
    }));
  } catch {
    return [];
  }
}
