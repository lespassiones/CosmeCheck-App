/**
 * admin-ocr-submission — OCR d'une contribution photo utilisateur (ADMIN).
 *
 * Contribution = ligne cosme_check.catalog_photo_submissions (EAN + 2 photos :
 * photo_path_1 = DEVANT, photo_path_2 = LISTE D'INGRÉDIENTS) déposée par un
 * utilisateur après un scan d'un produit absent du catalogue.
 *
 * Cette fonction (déclenchée MANUELLEMENT par l'admin) :
 *   1. télécharge la photo choisie depuis le bucket `cosmetwiki-products`
 *   2. la passe en base64 et réutilise la MÊME logique OCR que le scan mobile
 *      (`ocr-scan/lib.ts`) : `ocrFromImageBase64` (INCI) + `ocrFrontFromImageBase64`
 *      (marque / nom depuis le devant) — gpt-4o-mini vision, aucune duplication.
 *   3. persiste le résultat (extracted_inci / name / brand) pour relecture.
 *
 * L'admin RELIT/CORRIGE, puis publie via `admin-score-upsert` (score V2 + catalogue).
 * Réservé admin (SERVICE_ROLE_KEY en Bearer, verify_jwt=true + isAdminCaller).
 * Body   : { submissionId, inciPhoto?: "photo_path_1" | "photo_path_2" }
 * Sortie : { ok, ean, inci, uncertain, validation, name, brand, productType, reason? }
 */
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/auth.ts";
import { isAdminCaller } from "../_shared/adminAuth.ts";
import { ocrFromImageBase64, ocrFrontFromImageBase64 } from "../ocr-scan/lib.ts";
// deno-lint-ignore no-explicit-any
type SB = any;

const BUCKET = "cosmetwiki-products";

/** Uint8Array → base64 (par blocs pour éviter le dépassement de pile). */
function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

/** Type MIME d'après l'extension (les contributions client sont en .webp). */
function mimeFromPath(path: string): string {
  const p = path.toLowerCase();
  if (p.endsWith(".png")) return "image/png";
  if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
  return "image/webp";
}

async function downloadBase64(svc: SB, path: string): Promise<string | null> {
  try {
    const { data, error } = await svc.storage.from(BUCKET).download(path);
    if (error || !data) return null;
    const buf = new Uint8Array(await data.arrayBuffer());
    return toBase64(buf);
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") return jsonResponse({ error: "Méthode non autorisée." }, { status: 405 });
  if (!isAdminCaller(req.headers.get("Authorization") ?? "")) {
    return jsonResponse({ error: "unauthorized" }, { status: 401 });
  }

  let body: { submissionId?: string; inciPhoto?: "photo_path_1" | "photo_path_2" };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Requête invalide." }, { status: 400 });
  }
  const submissionId = String(body.submissionId ?? "").trim();
  if (!submissionId) return jsonResponse({ ok: false, reason: "submissionId manquant" }, { status: 400 });

  const svc = serviceClient();
  const { data: sub, error: subErr } = await svc
    .schema("cosme_check")
    .from("catalog_photo_submissions")
    .select("id, ean, name, brand, photo_path_1, photo_path_2")
    .eq("id", submissionId)
    .maybeSingle();
  if (subErr || !sub) return jsonResponse({ ok: false, reason: "Soumission introuvable" }, { status: 404 });

  // Photo INCI = la 2e (ingrédients) par défaut ; l'admin peut choisir la 1re.
  const inciPath = (body.inciPhoto === "photo_path_1" ? sub.photo_path_1 : sub.photo_path_2) || sub.photo_path_1;
  const frontPath = sub.photo_path_1 || sub.photo_path_2;
  if (!inciPath) return jsonResponse({ ok: false, reason: "Aucune photo à analyser" }, { status: 400 });

  const inciB64 = await downloadBase64(svc, inciPath);
  if (!inciB64) return jsonResponse({ ok: false, reason: "Téléchargement de la photo échoué" }, { status: 500 });

  const ocr = await ocrFromImageBase64(svc, inciB64, mimeFromPath(inciPath));

  // Devant → marque / nom (secondaire, ne bloque jamais).
  let frontName: string | null = null;
  let frontBrand: string | null = null;
  let productType: string | null = null;
  if (frontPath) {
    const frontB64 = frontPath === inciPath ? inciB64 : await downloadBase64(svc, frontPath);
    if (frontB64) {
      try {
        const f = await ocrFrontFromImageBase64(frontB64, mimeFromPath(frontPath));
        if (f.found) {
          frontName = f.productName ?? null;
          frontBrand = f.brand ?? null;
          productType = f.productType ?? null;
        }
      } catch { /* front optionnel */ }
    }
  }

  const inci = ocr.found ? (ocr.text ?? "") : "";
  const name = frontName || sub.name || null;
  const brand = frontBrand || sub.brand || null;

  // Persiste pour reprise (l'admin relira/corrigera avant publication).
  try {
    await svc
      .schema("cosme_check")
      .from("catalog_photo_submissions")
      .update({ extracted_inci: inci || null, extracted_name: name, extracted_brand: brand })
      .eq("id", submissionId);
  } catch { /* best-effort */ }

  return jsonResponse({
    ok: ocr.found,
    ean: sub.ean,
    inci,
    uncertain: ocr.found ? (ocr.uncertain ?? []) : [],
    validation: ocr.found ? (ocr.validation ?? null) : null,
    name,
    brand,
    productType,
    reason: ocr.found ? null : ((ocr as { reason?: string }).reason ?? "OCR échoué"),
  });
});
