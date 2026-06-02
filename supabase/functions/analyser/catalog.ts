/**
 * Écritures persistantes service-role : product_analyses (cache EAN) + catalog.
 * Ports de `CosmetWiki/lib/db/catalog.ts` (upsertCatalogProduct) et de l'appel
 * `cosme_check_upsert_product_analysis` inline dans le handler web. Toujours
 * fire-and-forget : ne throw jamais (les erreurs sont avalées).
 */
import { serviceClient } from "../_shared/auth.ts";

export async function upsertProductAnalysis(params: {
  ean: string;
  resultJson: unknown;
  score: number;
  scoreLabel: string;
  scoreTone: string;
  algoVersion?: string;
}): Promise<void> {
  try {
    await serviceClient()
      .schema("cosme_check")
      .rpc("cosme_check_upsert_product_analysis", {
        p_ean: params.ean,
        p_result_json: params.resultJson,
        p_score: params.score,
        p_score_label: params.scoreLabel,
        p_score_tone: params.scoreTone,
        p_algo_version: params.algoVersion ?? "v1.1",
      });
  } catch {
    // non-bloquant
  }
}

/**
 * Normalise une requête produit (port verbatim de
 * CosmetWiki/lib/productSearch/normalize.ts). Sert de clé du cache name-search.
 */
const NORMALIZE_DIACRITICS_RE = new RegExp("[\\u0300-\\u036f]", "g");
export function normalizeQuery(q: string): string {
  return q
    .toLowerCase()
    .normalize("NFD")
    .replace(NORMALIZE_DIACRITICS_RE, "")
    .replace(/[^a-z0-9+\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((w) => w.length > 1)
    .sort()
    .join(" ");
}

/**
 * Écrit dans product_inci_cache via la RPC SECURITY DEFINER (service-role).
 * Port de CosmetWiki/lib/productSearch/cache.ts → setProductCache. Best-effort.
 */
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
