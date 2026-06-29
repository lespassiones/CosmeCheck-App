/**
 * Cache TTL des résultats de scan code-barres — clé = EAN, TTL = 12h.
 *
 * MIGRATION (29 juin 2026) : remplace Deno.openKv() (indisponible) par
 * table Postgres cosme_check.scan_cache.
 * Dégradation silencieuse si DB indisponible ou hors Deno. Aucune exception remontée.
 */

/** TTL des entrées : 12h. Au-delà, on re-scrape OBF/OPF. */
export const BARCODE_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

/**
 * Lit le résultat caché pour un EAN depuis la table scan_cache (Deno/Edge Functions only).
 * Retourne `null` si miss, DB indispo, ou format invalide. Ne throw jamais.
 */
export async function getCachedBarcodeResult<T>(ean: string): Promise<T | null> {
  try {
    // Only in Deno environment
    if (typeof Deno === 'undefined') return null;

    const url = Deno.env.get("SUPABASE_URL") || "";
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!url || !key) return null;

    // Dynamic import only in Deno
    // @deno-types="https://esm.sh/@supabase/supabase-js@2"
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const sb = createClient(url, key);

    const { data, error } = await sb
      .from("scan_cache")
      .select("result_json")
      .eq("ean", ean)
      .gt("expires_at", new Date().toISOString())
      .single();
    if (error || !data) return null;
    return (data.result_json as T) ?? null;
  } catch {
    return null;
  }
}

/**
 * Met en cache un résultat pour un EAN. Best-effort, non-bloquant.
 * Invoque via `void cacheBarcodeResult(...)`.
 */
export async function cacheBarcodeResult(ean: string, value: unknown): Promise<void> {
  try {
    // Only in Deno environment
    if (typeof Deno === 'undefined') return;

    const url = Deno.env.get("SUPABASE_URL") || "";
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!url || !key) return;

    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const sb = createClient(url, key);

    const expiresAt = new Date(Date.now() + BARCODE_CACHE_TTL_MS).toISOString();
    await sb.from("scan_cache").upsert({
      ean,
      result_json: value,
      expires_at: expiresAt,
    });
  } catch {
    // ignore
  }
}
