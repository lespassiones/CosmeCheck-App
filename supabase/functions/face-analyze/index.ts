/**
 * Edge Function `face-analyze` — scan visage (score de peau, chantier « Ma peau »).
 *
 * Analyse Vision (gpt-4o-mini) d'un selfie : gate qualité (lunettes, luminosité,
 * flou, cadrage…) PUIS notation de 5 dimensions 0-100 (100 = idéal). Le client
 * mobile envoie l'image en base64 (data-URI toléré), déjà redimensionnée à
 * 1600px comme le flux OCR.
 *
 * Pipeline (design section 2, squelette CORS/body repris d'ocr-scan) :
 *   1. Gate : auth Bearer + rate-limit IP (10/min) + débit DIFFÉRÉ (costCredits 0).
 *   2. checkImage (mime allowlist + taille décodée ≤ 6 Mo) -> 400/413.
 *   3. sha256 du base64 -> idempotence : un scan identique déjà en base est
 *      renvoyé tel quel, ZÉRO débit, ZÉRO appel Vision.
 *   4. Cache IA (ai_cache 'face_scan:{sha}') sinon appel Vision, puis setCached
 *      (couvre aussi le re-envoi d'une photo REJETÉE : pas de 2e appel Vision).
 *   5. parseFaceAnalyzeOutput : JSON invalide -> 500 SANS débit ;
 *      quality.ok=false -> 200 rejet SANS débit ; sinon on continue.
 *   6. Débit de 2 crédits APRÈS le gate qualité (429 pass-through si épuisé).
 *   7. Upload photo (service role, bucket privé skin-photos, retry x1) + insert
 *      face_scans (service role). Course UNIQUE -> re-select de l'existant.
 *
 * Entrée : { image: string (base64|data-URI), mimeType?: 'image/jpeg' }
 * Sortie : voir le contrat FaceAnalyzeResult (lib/skin/api.ts côté client).
 * Crédit : 2 (différés, uniquement si quality.ok).
 */
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { gate } from "../_shared/gate.ts";
import { serviceClient } from "../_shared/auth.ts";
import {
  AI_MODEL,
  callWithFallback,
  getCached,
  openai,
  setCached,
  sha256Hex,
} from "../_shared/aiClient.ts";
import { checkImage } from "./lib/validate.ts";
import { parseFaceAnalyzeOutput } from "./lib/parse.ts";
import { scanGlobal } from "./lib/score.ts";
import { buildFaceAnalyzePrompt, FACE_PROMPT_VERSION } from "./lib/prompt.ts";

type Body = {
  image?: string;
  mimeType?: string;
};

/** Décode une chaîne base64 (sans data-URI) en octets bruts. */
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

type FaceScanRow = {
  id: string;
  metrics: Record<string, number>;
  score: number;
};

Deno.serve(async (req: Request): Promise<Response> => {
  const pre = handleOptions(req);
  if (pre) return pre;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Méthode non autorisée." }, { status: 405 });
  }

  // ── 1. Gate : auth + rate-limit IP. Débit DIFFÉRÉ (costCredits 0). ─────────
  const g = await gate(req, { feature: "face_scan", costCredits: 0, rateMax: 10 });
  if (!g.ok) return g.response;
  const userId = g.user.id;

  // ── 2. Parse body + validation image. ─────────────────────────────────────
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return jsonResponse({ error: "Requête invalide." }, { status: 400 });
  }

  const mimeType = (body.mimeType ?? "image/jpeg").trim();
  const check = checkImage(body.image, mimeType);
  if (!check.ok) {
    return jsonResponse({ error: check.error }, { status: check.status });
  }
  const base64 = check.base64; // data-URI déjà retiré par checkImage

  // ── 3. Idempotence : même photo déjà scannée -> renvoi sans débit. ────────
  const svc = serviceClient();
  const sha = await sha256Hex(base64);

  const { data: existing } = await svc
    .schema("cosme_check")
    .from("face_scans")
    .select("id, metrics, score")
    .eq("user_id", userId)
    .eq("image_sha256", sha)
    .maybeSingle<FaceScanRow>();

  if (existing) {
    return jsonResponse({
      ok: true,
      scanId: existing.id,
      metrics: existing.metrics,
      score: existing.score,
      quality: { ok: true },
      alreadyAnalyzed: true,
    });
  }

  // ── 4. Cache IA sinon appel Vision. On cache la sortie BRUTE du modèle. ───
  // La version de prompt est dans la clé : une amélioration des consignes
  // ré-analyse la même photo au lieu de servir l'ancien verdict caché.
  const cacheKey = `face_scan:${FACE_PROMPT_VERSION}:${sha}`;
  let raw = await getCached<string>(cacheKey);
  if (raw == null) {
    try {
      const prompt = buildFaceAnalyzePrompt();
      // data-URI construit avec le mimeType ORIGINAL fourni par le client.
      const dataUri = `data:${mimeType};base64,${base64}`;
      raw = await callWithFallback<string>({
        feature: "face_scan",
        userId,
        model: AI_MODEL,
        timeoutMs: 20_000,
        primary: async () => {
          const r = await openai().chat.completions.create({
            model: AI_MODEL,
            temperature: 0,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: prompt.system },
              {
                role: "user",
                content: [
                  { type: "text", text: prompt.user },
                  { type: "image_url", image_url: { url: dataUri, detail: "high" } },
                ],
              },
            ],
          });
          const content = r.choices?.[0]?.message?.content ?? "";
          return {
            value: content,
            tokensIn: r.usage?.prompt_tokens,
            tokensOut: r.usage?.completion_tokens,
          };
        },
      });
    } catch {
      return jsonResponse({ error: "Analyse indisponible pour le moment." }, { status: 500 });
    }
    await setCached(cacheKey, raw);
  }

  // ── 5. Parse strict. ──────────────────────────────────────────────────────
  const parsed = parseFaceAnalyzeOutput(raw ?? "");
  if (!parsed) {
    // JSON invalide / métrique manquante : 500 SANS débit.
    return jsonResponse(
      { error: "Réponse d'analyse illisible. Réessaie." },
      { status: 500 },
    );
  }

  if (!parsed.quality.ok || !parsed.metrics) {
    // Rejet qualité : AUCUN débit, rien d'inséré.
    return jsonResponse({ ok: false, quality: parsed.quality });
  }

  const metrics = parsed.metrics;
  const score = scanGlobal(metrics);

  // ── 6. Débit de 2 crédits APRÈS le gate qualité. ──────────────────────────
  const charge = await g.consumeCredit("face_scan", 2);
  if (!charge.ok) return charge.response;

  // ── 7. Upload (retry x1) + insert (service role). ─────────────────────────
  const scanId = crypto.randomUUID();
  const photoPath = `${userId}/${scanId}.jpg`;
  const bytes = base64ToBytes(base64);

  let uploadOk = false;
  for (let attempt = 0; attempt < 2 && !uploadOk; attempt++) {
    const { error: upErr } = await svc.storage
      .from("skin-photos")
      .upload(photoPath, bytes, { contentType: "image/jpeg", upsert: true });
    if (!upErr) uploadOk = true;
  }
  if (!uploadOk) {
    // Crédit débité mais stockage indisponible : 500, risque assumé (design §10).
    return jsonResponse(
      { error: "Impossible d'enregistrer la photo. Réessaie." },
      { status: 500 },
    );
  }

  const { error: insErr } = await svc
    .schema("cosme_check")
    .from("face_scans")
    .insert({
      id: scanId,
      user_id: userId,
      photo_path: photoPath,
      metrics,
      score,
      model: AI_MODEL,
      quality: { ok: true },
      image_sha256: sha,
    });

  if (insErr) {
    // Course sur UNIQUE(user_id, image_sha256) : re-select et renvoi existant.
    const isUnique =
      (insErr as { code?: string }).code === "23505" ||
      /duplicate key|unique/i.test(insErr.message ?? "");
    if (isUnique) {
      const { data: raced } = await svc
        .schema("cosme_check")
        .from("face_scans")
        .select("id, metrics, score")
        .eq("user_id", userId)
        .eq("image_sha256", sha)
        .maybeSingle<FaceScanRow>();
      if (raced) {
        return jsonResponse({
          ok: true,
          scanId: raced.id,
          metrics: raced.metrics,
          score: raced.score,
          quality: { ok: true },
          alreadyAnalyzed: true,
        });
      }
    }
    return jsonResponse(
      { error: "Impossible d'enregistrer l'analyse. Réessaie." },
      { status: 500 },
    );
  }

  return jsonResponse({
    ok: true,
    scanId,
    metrics,
    score,
    quality: { ok: true },
    credits: charge.credits,
  });
});
