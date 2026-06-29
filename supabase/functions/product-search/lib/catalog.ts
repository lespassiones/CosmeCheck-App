// Own-catalog reads (cosme_check_search_catalog) + persistent upsert
// (cosme_check_upsert_catalog_product). Ports of CosmetWiki
// lib/productSearch/catalog.ts + lib/db/catalog.ts. All Supabase access goes
// through the service-role client (RLS bypass; reads are public catalog data).
import { serviceClient } from "../../_shared/auth.ts";
import { matchesQuery } from "./relevance.ts";
import type { ProductCandidate } from "./types.ts";

type CatalogRow = {
  ean: string;
  brand: string | null;
  name: string;
  category?: string | null;
  image_url?: string | null;
  source_url?: string | null;
  score?: number;
  score_label?: string;
  score_tone?: string;
  count_total?: number | null;
  count_orange?: number | null;
  count_rouge?: number | null;
  ingredients_text: string | null;
};

/** First catalog hit that has a non-empty INCI and passes the relevance gate.
 *  Single indexed Postgres query, sub-100 ms. */
export async function searchCatalogByName(query: string): Promise<{
  brand: string | null;
  productName: string;
  ingredientsText: string;
  ean: string;
} | null> {
  try {
    const { data, error } = await serviceClient().rpc("cosme_check_search_catalog", {
      p_query: query,
      p_limit: 5,
    });
    if (error || !data) return null;
    const rows = data as CatalogRow[];
    for (const row of rows) {
      if (!row.ingredients_text || row.ingredients_text.trim().length < 5) continue;
      const label = `${row.brand ?? ""} ${row.name}`;
      if (!matchesQuery(query, label)) continue;
      return {
        brand: row.brand,
        productName: row.name,
        ingredientsText: row.ingredients_text,
        ean: row.ean,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/** Catalog candidates for the disambiguation list (product-suggest). */
export async function fetchCatalogCandidates(
  query: string,
  limit: number,
): Promise<ProductCandidate[]> {
  try {
    const { data, error } = await serviceClient().rpc("cosme_check_search_catalog", {
      p_query: query,
      p_limit: limit,
    });
    if (error || !data) return [];
    return (data as CatalogRow[]).map((r) => ({
      id: `catalog-${r.ean}`,
      brand: r.brand,
      productName: r.name,
      ingredientsText: r.ingredients_text ?? "",
      imageUrl: r.image_url ?? null,
      sourceUrl: r.source_url ?? "",
      source: "catalog" as const,
      ean: r.ean,
      score: r.score ?? null,
      scoreLabel: r.score_label ?? null,
      scoreTone: r.score_tone ?? null,
    }));
  } catch {
    return [];
  }
}

/** Persistent catalog upsert. Fire-and-forget; never throws. */
export async function upsertCatalogProduct(params: {
  ean: string;
  brand?: string | null;
  name?: string | null;
  ingredientsText?: string | null;
  sourceUrl?: string | null;
  category?: string | null;
  score?: number | null;
  scoreLabel?: string | null;
  scoreTone?: string | null;
  countTotal?: number | null;
  imageUrl?: string | null;
}): Promise<void> {
  try {
    const { error } = await serviceClient().rpc("cosme_check_upsert_catalog_product", {
      p_ean: params.ean,
      p_brand: params.brand ?? null,
      p_name: params.name ?? null,
      p_ingredients_text: params.ingredientsText ?? null,
      p_source_url: params.sourceUrl ?? null,
      p_category: params.category ?? null,
      p_score: params.score ?? null,
      p_score_label: params.scoreLabel ?? null,
      p_score_tone: params.scoreTone ?? null,
      p_count_total: params.countTotal ?? null,
      p_image_url: params.imageUrl ?? null,
    });
    if (error) console.warn("[catalog] upsert error:", error.message);
  } catch (err) {
    console.warn("[catalog] upsert failed:", err);
  }
}
