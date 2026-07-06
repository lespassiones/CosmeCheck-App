/**
 * Cache TTL des résultats de scan code-barres — clé = EAN, TTL = 12h.
 * Stocké dans cosme_check.scan_cache (Postgres, via serviceClient).
 * Dégradation silencieuse si DB indisponible. Aucune exception remontée.
 */
import { serviceClient } from "../../_shared/auth.ts";

/** TTL des entrées : 12h. */
export const BARCODE_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

/**
 * Lit le résultat caché pour un EAN depuis cosme_check.scan_cache.
 * Retourne `null` si miss, expiré, ou DB indispo. Ne throw jamais.
 */
export async function getCachedBarcodeResult<T>(ean: string): Promise<T | null> {
  try {
    const { data, error } = await serviceClient()
      .schema("cosme_check")
      .from("scan_cache")
      .select("result_json")
      .eq("ean", ean)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (error || !data) return null;
    return (data.result_json as T) ?? null;
  } catch {
    return null;
  }
}

/**
 * Met en cache un résultat pour un EAN dans cosme_check.scan_cache.
 * Best-effort — invoquer via `void cacheBarcodeResult(...)`.
 */
export async function cacheBarcodeResult(ean: string, value: unknown): Promise<void> {
  try {
    const expiresAt = new Date(Date.now() + BARCODE_CACHE_TTL_MS).toISOString();
    await serviceClient()
      .schema("cosme_check")
      .from("scan_cache")
      .upsert({ ean, result_json: value, expires_at: expiresAt });
  } catch {
    // ignore
  }
}
