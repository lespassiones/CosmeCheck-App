/**
 * Validation d'image base64 (Edge Function `face-analyze`).
 *
 * Module FEUILLE : zéro import, zéro global Deno. RÉIMPLÉMENTATION autonome
 * de `approxDecodedBytes` / `stripDataUri` / `checkImage` d'ocr-scan
 * (supabase/functions/ocr-scan/index.ts), extraite ici pour être testable en
 * Jest node. Différence assumée avec l'original : `checkImage` renvoie un
 * RÉSULTAT STRUCTURÉ ({ ok } / { ok:false, status, error }) au lieu d'une
 * Response, pour rester sans dépendance ; c'est le handler index.ts qui
 * convertit en réponse HTTP (400 / 413).
 */

/** Taille maximale APRÈS décodage base64 : 6 Mo (aligné sur ocr-scan). */
export const MAX_IMAGE_BYTES = 6 * 1024 * 1024

/** Types MIME acceptés (allowlist identique à ocr-scan). */
export const ALLOWED_IMAGE_MIME: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]

/** Taille approximative en octets d'une chaîne base64 (sans la décoder). */
export function approxDecodedBytes(b64: string): number {
  const len = b64.length
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0
  return Math.floor((len * 3) / 4) - padding
}

/** Retire un éventuel préfixe data:URI ("data:image/jpeg;base64,") du base64. */
export function stripDataUri(b64: string): string {
  const comma = b64.indexOf(',')
  if (b64.startsWith('data:') && comma >= 0) return b64.slice(comma + 1)
  return b64
}

export type ImageCheckResult =
  | { ok: true; base64: string }
  | { ok: false; status: 400 | 413; error: string }

/**
 * Valide une image envoyée en base64 (data-URI toléré) : présence, MIME
 * autorisé, taille décodée sous MAX_IMAGE_BYTES. Messages FR identiques à
 * ceux d'ocr-scan pour la cohérence des erreurs côté client.
 */
export function checkImage(rawB64: unknown, mimeType: string): ImageCheckResult {
  if (typeof rawB64 !== 'string' || rawB64.trim().length === 0) {
    return { ok: false, status: 400, error: 'Image manquante.' }
  }
  if (!ALLOWED_IMAGE_MIME.includes(mimeType)) {
    return { ok: false, status: 400, error: "Format d'image non supporté." }
  }
  const base64 = stripDataUri(rawB64.trim())
  if (approxDecodedBytes(base64) > MAX_IMAGE_BYTES) {
    return { ok: false, status: 413, error: 'Image trop volumineuse (max 6 Mo).' }
  }
  return { ok: true, base64 }
}
