/**
 * admin-score-upsert — note + upsert catalogue à partir d'un INCI DÉJÀ RÉSOLU.
 *
 * Différence avec admin-resolve-barcode : celui-ci NE FAIT AUCUNE recherche
 * (pas d'OBF, pas de GPT, ZÉRO appel OpenAI). Le nom/marque/INCI sont fournis
 * par l'appelant (résolution web faite ailleurs). On réutilise EXACTEMENT le
 * moteur de notation de l'analyser (parseInciList → cosme_check_match_inci_batch
 * → pastilleTone → synthScore) pour garantir une pastille identique au reste
 * du catalogue, puis on upsert.
 *
 * Réservé admin (SERVICE_ROLE_KEY en Bearer).
 * Body  : { ean, name?, brand?, inci, category?, image_url?, source_url? }
 * Sortie: { ok:true, ean, score, scoreLabel, countOrange, countRouge, category }
 *       | { ok:false, ean, reason }
 */
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/auth.ts";
import { isAdminCaller } from "../_shared/adminAuth.ts";
import { parseInciList } from "../analyser/parse.ts";
import { pastilleTone, scoreLabel, synthScore, type ColorRating } from "../analyser/score.ts";
import { slugifyCategoryPath } from "../_shared/eanWebSearch.ts";

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") return jsonResponse({ error: "Méthode non autorisée." }, { status: 405 });
  if (!isAdminCaller(req.headers.get("Authorization") ?? "")) {
    return jsonResponse({ error: "unauthorized" }, { status: 401 });
  }

  let body: {
    ean?: string;
    name?: string;
    brand?: string;
    inci?: string;
    category?: string;
    image_url?: string;
    source_url?: string;
  };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Requête invalide." }, { status: 400 });
  }

  const ean = String(body.ean ?? "").trim();
  const inci = String(body.inci ?? "").trim();
  if (!ean) return jsonResponse({ ok: false, ean: "", reason: "EAN manquant" }, { status: 400 });
  if (inci.length < 20) return jsonResponse({ ok: false, ean, reason: "INCI trop court/absent" });

  const name = body.name?.trim() || null;
  const brand = body.brand?.trim() || null;
  const catSlug = slugifyCategoryPath(body.category ?? null);
  const imageUrl = body.image_url?.trim() || null;
  const sourceUrl = body.source_url?.trim()?.slice(0, 500) || null;

  // ── Note + blocus (mêmes fonctions que l'analyser, aucun LLM). ─────────────
  const tokens = parseInciList(inci);
  if (tokens.length === 0) return jsonResponse({ ok: false, ean, reason: "INCI non parsable" });

  const svc = serviceClient();
  const { data: matchData, error: matchErr } = await svc.rpc("cosme_check_match_inci_batch", {
    p_tokens: tokens.map((t) => t.normalized),
  });
  if (matchErr) return jsonResponse({ ok: false, ean, reason: "Échec matching INCI" });

  type MatchRow = { color_rating: ColorRating | null; position_idx: number };
  const matches = ((matchData ?? []) as MatchRow[]).map((r) => ({
    color: r.color_rating,
    position: (r.position_idx ?? 0) + 1,
  }));
  // Gate ACTIVÉ (fix 27 juil 2026) : un INCI dont < 50 % des ingrédients sont
  // reconnus (OCR-charabia, langue étrangère, préfixe « Effective ingredients: »,
  // séparateurs points/tirets) ne DOIT PAS recevoir de score. Sinon « rien de
  // pénalisant reconnu » ⇒ faux « Très bien » vert au catalogue (cf. incident
  // Corinne de Farme : filtres UV mutilés → non comptés → 20/20). On REFUSE
  // l'upsert plutôt que d'injecter une note gonflée. Un produit sain à liste
  // courte (mono-ingrédient : « GLYCERIN ») reste identifié à 100 % → passe.
  const pastille = pastilleTone(matches, tokens.length, true);
  if (pastille.tone === "unknown") {
    return jsonResponse({
      ok: false,
      ean,
      reason: "INCI illisible : moins de 50 % des ingrédients reconnus — non noté (aucune note injectée au catalogue).",
    });
  }
  const score = synthScore(pastille) ?? 0;
  let countOrange = 0, countRouge = 0;
  for (const m of matches) {
    if (m.color === "Orange") countOrange++;
    if (m.color === "Rouge") countRouge++;
  }
  const { label, tone } = scoreLabel(score);

  // ── Upsert catalogue (même RPC que admin-resolve-barcode). ─────────────────
  try {
    await svc.rpc("cosme_check_upsert_catalog_product", {
      p_ean: ean,
      p_brand: brand,
      p_name: name,
      p_ingredients_text: inci,
      p_source_url: sourceUrl,
      p_category: catSlug,
      p_score: Number(score.toFixed(4)),
      p_score_label: label,
      p_score_tone: tone,
      p_count_total: tokens.length,
      p_image_url: imageUrl,
    });
    await svc.schema("cosme_check").from("catalog")
      .update({ count_orange: countOrange, count_rouge: countRouge, is_active: true })
      .eq("ean", ean);
  } catch {
    return jsonResponse({ ok: false, ean, reason: "Échec écriture catalogue" });
  }

  return jsonResponse({
    ok: true,
    ean,
    name,
    brand,
    score: Number(score.toFixed(1)),
    scoreLabel: label,
    category: catSlug,
    countOrange,
    countRouge,
  });
});
