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

/** Lookup a catalog product by EAN. Returns the row or null (never throws). */
export async function lookupCatalogByEan(ean: string): Promise<{
  ean: string;
  brand: string | null;
  name: string | null;
  ingredientsText: string | null;
} | null> {
  try {
    const { data, error } = await serviceClient()
      .schema("cosme_check")
      .from("catalog")
      .select("ean, brand, name, ingredients_text")
      .eq("ean", ean)
      .maybeSingle();
    if (error || !data) return null;
    return {
      ean: data.ean as string,
      brand: data.brand as string | null,
      name: data.name as string | null,
      ingredientsText: data.ingredients_text as string | null,
    };
  } catch {
    return null;
  }
}

/** Résultat du lookup EAN : distingue « ligne absente » (réponse DB saine,
 *  row:null) d'un ÉCHEC de requête (ok:false). CRUCIAL : avant (18 juil 2026),
 *  une erreur transitoire (timeout, pool saturé) renvoyait null = traitée comme
 *  « produit inconnu » → faux « pas dans notre base » intermittent au scan. */
export type CatalogLookup = { ok: true; row: CatalogRow | null } | { ok: false };

/** Lecture du catalogue par EAN exact (forme snake_case complète). Source
 *  unique de vérité du scan. 1 retry léger (150 ms) absorbe les hoquets DB ;
 *  au-delà on signale l'échec (ok:false) au lieu de mentir « inconnu ». */
export async function getCatalogByEan(ean: string): Promise<CatalogLookup> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { data, error } = await serviceClient()
        .schema("cosme_check")
        .from("catalog")
        .select("ean, brand, name, ingredients_text, source_url, image_url, count_total, category, score, score_tone, score_label, count_orange, count_rouge")
        .eq("ean", ean)
        .maybeSingle();
      if (!error) return { ok: true, row: (data as CatalogRow | null) ?? null };
    } catch {
      /* transitoire → retry */
    }
    if (attempt === 0) await new Promise((r) => setTimeout(r, 150));
  }
  return { ok: false };
}

/** Enregistre un code-barres scanné mais inconnu dans le catalogue, en mode
 *  "à compléter" (masqué tant qu'il n'a pas de liste INCI). Idempotent côté DB
 *  (ON CONFLICT DO NOTHING). Fire-and-forget ; ne jette jamais. */
export async function registerScannedBarcode(ean: string): Promise<void> {
  try {
    const { error } = await serviceClient().rpc(
      "cosme_check_register_scanned_barcode",
      { p_ean: ean },
    );
    if (error) console.warn("[catalog] register scanned barcode error:", error.message);
  } catch (err) {
    console.warn("[catalog] register scanned barcode failed:", err);
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
