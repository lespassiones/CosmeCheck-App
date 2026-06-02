/**
 * Edge Function `ocr-scan` — port de `CosmetWiki/app/api/ocr/route.ts` +
 * `lib/ai/ocr.ts`.
 *
 * OCR Vision (gpt-4o-mini) de l'étiquette DOS d'un cosmétique (liste INCI) +
 * optionnellement la face AVANT (identité produit). Le client mobile envoie
 * les images en base64 (PAS de multipart) — il a déjà redimensionné à 1600px.
 *
 * Pipeline (ordre IDENTIQUE au web) :
 *   1. Gate : auth Bearer + rate-limit IP + débit de 1 crédit (feature "ocr").
 *   2. Parse body + valide les images (mime allowlist + taille décodée ≤ 6 Mo).
 *      Pas de court-circuit 503 : comme le web, l'absence de clé OpenAI N'est
 *      PAS gérée ici ; `ocrFromImageBase64` renvoie { found:false,
 *      reason:"openai_unavailable" } (réponse 200) → le client bascule Tesseract.
 *   3. Lance back (requis) + front (optionnel) en parallèle. La validation des
 *      tokens passe par cosme_check_match_inci_batch (service-role) pour le flag.
 *   4. Réponse rétro-compatible : top-level found/text/uncertain/validation
 *      reflètent l'OCR dos ; `front` exposé en plus.
 *
 * Entrée : { image_back: base64, image_front?: base64, mimeType: string }
 * Sortie (succès dos) : { found:true, text, uncertain, validation, front? }
 * Sortie (échec dos)  : { found:false, reason, front? }
 * Crédit : 1.
 */
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { gate } from "../_shared/gate.ts";
import { serviceClient } from "../_shared/auth.ts";
import {
  ocrFrontFromImageBase64,
  ocrFromImageBase64,
  type OcrFrontResult,
} from "./lib.ts";

type Body = {
  image_back?: string;
  image_front?: string;
  /** Alias rétro-compat (l'ancien flux mono-image envoyait `image`). */
  image?: string;
  mimeType?: string;
};

const MAX_BYTES = 6 * 1024 * 1024; // 6 Mo après décodage base64
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

/** Taille approximative en octets d'une chaîne base64 (sans la décoder). */
function approxDecodedBytes(b64: string): number {
  const len = b64.length;
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((len * 3) / 4) - padding;
}

/** Retire un éventuel préfixe data:URI ("data:image/jpeg;base64,") du base64. */
function stripDataUri(b64: string): string {
  const comma = b64.indexOf(",");
  if (b64.startsWith("data:") && comma >= 0) return b64.slice(comma + 1);
  return b64;
}

type ImageCheck =
  | { ok: true; base64: string }
  | { ok: false; error: string; status: number };

function checkImage(rawB64: unknown, mimeType: string): ImageCheck {
  if (typeof rawB64 !== "string" || rawB64.trim().length === 0) {
    return { ok: false, error: "Image manquante.", status: 400 };
  }
  if (!ALLOWED_MIME.has(mimeType)) {
    return { ok: false, error: "Format d'image non supporté.", status: 400 };
  }
  const base64 = stripDataUri(rawB64.trim());
  if (approxDecodedBytes(base64) > MAX_BYTES) {
    return { ok: false, error: "Image trop volumineuse (max 6 Mo).", status: 413 };
  }
  return { ok: true, base64 };
}

Deno.serve(async (req: Request): Promise<Response> => {
  const pre = handleOptions(req);
  if (pre) return pre;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Méthode non autorisée." }, { status: 405 });
  }

  // ── 1. Gate : auth + rate-limit + débit 1 crédit. ─────────────────────────
  const g = await gate(req, { feature: "ocr", costCredits: 1 });
  if (!g.ok) return g.response;
  const userId = g.user.id;

  // ── 2. Parse body + validation images. ────────────────────────────────────
  // NOTE parité web : pas de court-circuit 503 ici. Comme `app/api/ocr/route.ts`,
  // l'absence de clé OpenAI N'est PAS gérée au niveau route ; c'est
  // `ocrFromImageBase64` qui renvoie { found:false, reason:"openai_unavailable" }
  // (réponse 200), pour que le client puisse basculer sur Tesseract.
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return jsonResponse({ error: "Requête invalide." }, { status: 400 });
  }

  const mimeType = (body.mimeType ?? "image/jpeg").trim();
  const backRaw = body.image_back ?? body.image;

  const backCheck = checkImage(backRaw, mimeType);
  if (!backCheck.ok) {
    return jsonResponse({ error: backCheck.error }, { status: backCheck.status });
  }

  // Une mauvaise photo avant ne doit PAS tuer la requête : l'INCI du dos est
  // l'exigence dure. On l'ignore silencieusement si invalide.
  let frontBase64: string | null = null;
  if (body.image_front) {
    const frontCheck = checkImage(body.image_front, mimeType);
    if (frontCheck.ok) frontBase64 = frontCheck.base64;
  }

  // ── 3. OCR dos (requis) + avant (optionnel) en parallèle. ─────────────────
  // Le lookup catalogue (validation) tourne en service-role (catalogue public,
  // comme supabaseAnon côté web).
  const svc = serviceClient();

  try {
    const [back, front] = await Promise.all([
      ocrFromImageBase64(svc, backCheck.base64, mimeType, userId),
      frontBase64
        ? ocrFrontFromImageBase64(frontBase64, mimeType, userId)
        : Promise.resolve(null as OcrFrontResult | null),
    ]);

    // ── 4. Réponse rétro-compatible. ────────────────────────────────────────
    if (back.found) {
      return jsonResponse({
        found: true,
        text: back.text,
        uncertain: back.uncertain,
        validation: back.validation,
        back,
        front,
      });
    }
    return jsonResponse({
      found: false,
      reason: back.reason,
      back,
      front,
    });
  } catch {
    return jsonResponse({ error: "Erreur lors du scan." }, { status: 500 });
  }
});
