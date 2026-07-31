/**
 * Écritures persistantes service-role : product_analyses (cache EAN) + catalog.
 * Ports de `CosmetWiki/lib/db/catalog.ts` (upsertCatalogProduct) et de l'appel
 * `cosme_check_upsert_product_analysis` inline dans le handler web. Toujours
 * fire-and-forget : ne throw jamais (les erreurs sont avalées).
 */
import { serviceClient } from "../_shared/auth.ts";

/**
 * Lit le score CATALOGUE (notation propriétaire CosmeCheck, source de vérité) pour un EAN.
 * Renvoie null si l'EAN n'est pas au catalogue (produit internet) ou sans score.
 * Sert à ne JAMAIS afficher/persister un score recalculé pour un produit connu.
 */
export async function getCatalogScore(
  ean: string,
): Promise<number | null> {
  try {
    const { data } = await serviceClient()
      .schema("cosme_check")
      .from("catalog")
      .select("score")
      .eq("ean", ean)
      .eq("is_active", true)
      .maybeSingle();
    const s = (data as { score: number | null } | null)?.score;
    return typeof s === "number" ? s : null;
  } catch {
    return null;
  }
}

/**
 * Lit la ligne catalogue (SOURCE DE VÉRITÉ) pour un EAN : score propriétaire +
 * slug de catégorie curé + INCI complet. Renvoie null si l'EAN n'est pas au
 * catalogue (produit hors catalogue). Sert à SERVIR un produit connu (jamais
 * recalculer ni re-catégoriser). `category` est null si la ligne existe mais
 * n'a pas de catégorie. `ingredientsText` est l'INCI AUTORITAIRE du catalogue :
 * pour un EAN connu, l'analyse doit se baser dessus plutôt que sur le texte
 * renvoyé par le client (qui peut être tronqué — bug ProductBrowsePage 200 car.).
 */
export async function getCatalogInfo(
  ean: string,
): Promise<{ score: number | null; category: string | null; ingredientsText: string | null } | null> {
  try {
    const { data } = await serviceClient()
      .schema("cosme_check")
      .from("catalog")
      .select("score, category, ingredients_text")
      .eq("ean", ean)
      .eq("is_active", true)
      .maybeSingle();
    if (!data) return null;
    const row = data as { score: number | null; category: string | null; ingredients_text: string | null };
    const cat =
      typeof row.category === "string" && row.category.trim() ? row.category : null;
    const inci =
      typeof row.ingredients_text === "string" && row.ingredients_text.trim()
        ? row.ingredients_text.trim()
        : null;
    return {
      score: typeof row.score === "number" ? row.score : null,
      category: cat,
      ingredientsText: inci,
    };
  } catch {
    return null;
  }
}

export async function upsertProductAnalysis(params: {
  ean: string;
  resultJson: unknown;
  score: number;
  scoreLabel: string;
  scoreTone: string;
  algoVersion?: string;
}): Promise<void> {
  try {
    // ⚠️ La RPC vit dans le schéma PUBLIC (comme toutes les cosme_check_*).
    // L'ancien appel `.schema("cosme_check").rpc(...)` cherchait la fonction
    // dans le mauvais schéma → 404 avalé par le catch → product_analyses ne
    // se remplissait JAMAIS (découvert 14 juil 2026, table restée à 0 ligne).
    const { error } = await serviceClient().rpc("cosme_check_upsert_product_analysis", {
      p_ean: params.ean,
      p_result_json: params.resultJson,
      p_score: params.score,
      p_score_label: params.scoreLabel,
      p_score_tone: params.scoreTone,
      p_algo_version: params.algoVersion ?? "v1.2",
    });
    if (error) console.warn("[product_analyses] upsert error:", error.message);
  } catch (err) {
    console.warn("[product_analyses] upsert failed:", err);
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
