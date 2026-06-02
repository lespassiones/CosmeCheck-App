/**
 * Cache TTL des résultats de scan code-barres — clé = EAN, TTL = 12h.
 *
 * Utilise Deno.openKv() (supporté par le runtime Supabase Edge Functions).
 * En cas d'indisponibilité (runtime sans KV, ou permission manquante), on
 * dégrade SILENCIEUSEMENT : tout marche, juste sans cache. Aucune exception
 * remontée à l'appelant.
 */

/** TTL des entrées : 12h. Au-delà, on re-scrape OBF/OPF. */
export const BARCODE_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

const KV_PREFIX = ["barcode-cache"] as const;

interface KvLike {
  get(key: readonly unknown[]): Promise<{ value: unknown }>;
  set(
    key: readonly unknown[],
    value: unknown,
    opts: { expireIn: number },
  ): Promise<unknown>;
  close?(): void;
}

let cachedKv: KvLike | null = null;
let kvInitFailed = false;

async function openKv(): Promise<KvLike | null> {
  if (cachedKv) return cachedKv;
  if (kvInitFailed) return null;
  try {
    // Deno.openKv() peut ne pas être disponible (sandbox, perm manquante).
    const maybe = (globalThis as { Deno?: { openKv?: () => Promise<KvLike> } })?.Deno?.openKv;
    if (typeof maybe !== "function") {
      kvInitFailed = true;
      return null;
    }
    cachedKv = await maybe();
    return cachedKv;
  } catch {
    kvInitFailed = true;
    return null;
  }
}

/**
 * Lit le résultat caché pour un EAN. Retourne `null` si miss, KV indispo, ou
 * format invalide. Ne throw jamais.
 */
export async function getCachedBarcodeResult<T>(ean: string): Promise<T | null> {
  const kv = await openKv();
  if (!kv) return null;
  try {
    const res = await kv.get([...KV_PREFIX, ean]);
    return (res.value as T) ?? null;
  } catch {
    return null;
  }
}

/**
 * Met en cache un résultat pour un EAN. Best-effort, non-bloquant côté
 * appelant (à invoquer via `void cacheBarcodeResult(...)`).
 */
export async function cacheBarcodeResult(ean: string, value: unknown): Promise<void> {
  const kv = await openKv();
  if (!kv) return;
  try {
    await kv.set([...KV_PREFIX, ean], value, { expireIn: BARCODE_CACHE_TTL_MS });
  } catch {
    // ignore
  }
}
