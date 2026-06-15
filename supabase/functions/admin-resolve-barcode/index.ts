/**
 * admin-resolve-barcode — résout un produit « code-barre seul » du catalogue.
 *
 * Pipeline : 1) Open Beauty Facts par code-barre (gratuit) → nom/marque/INCI/image.
 *            2) GPT web-search par code-barre → nom/marque/INCI/description +
 *               CATÉGORIE précise (famille/sous/feuille). 3) Calcule la note +
 *               compte orange/rouge (mêmes fonctions que `analyser`). 4) Upsert
 *               catalogue (score + catégorie + image + actif).
 *
 * Réservé à l'admin : on exige le SERVICE_ROLE_KEY en Authorization Bearer
 * (l'admin l'appelle via supabaseAdmin().functions.invoke).
 *
 * Body  : { ean }
 * Sortie: { ok:true, ean, name, brand, score, scoreLabel, category, countOrange, countRouge }
 *       | { ok:false, ean, reason }
 */
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/auth.ts";
import { AI_MODEL_SEARCH, hasOpenAI, logAI, openai } from "../_shared/aiClient.ts";
import { parseInciList } from "../analyser/parse.ts";
import { applyColorCap, computeScore, scoreLabel, type ColorRating } from "../analyser/score.ts";
import { slugifyCategoryPath } from "../_shared/eanWebSearch.ts";

const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const PROJECT_REF = "rogesnduejmqpxolhbif";

/**
 * Admin only : on accepte soit l'égalité exacte avec la clé service-role
 * injectée, soit un JWT de rôle `service_role` du bon projet (le format de la
 * clé injectée peut différer de celle utilisée par l'admin).
 */
function isAdminCaller(authHeader: string): boolean {
  if (SERVICE_KEY && authHeader === `Bearer ${SERVICE_KEY}`) return true;
  const m = authHeader.match(/^Bearer\s+(.+)$/);
  if (!m) return false;
  const parts = m[1].split(".");
  if (parts.length !== 3) return false;
  try {
    const json = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(json) as { role?: string; ref?: string };
    return payload.role === "service_role" && payload.ref === PROJECT_REF;
  } catch {
    return false;
  }
}

const CANONICAL_FAMILIES = [
  "Bien-être", "Coiffure", "Hygiène dentaire", "Hygiène du corps",
  "Manucure et pédicure", "Maquillage", "Parfum", "Produit solaire",
  "Rasage et épilation", "Santé", "Soin du corps et visage", "Soin et hygiène bébé",
];

type Resolved = {
  name: string | null;
  brand: string | null;
  inci: string | null;
  description: string | null;
  categoryPath: string | null;
  imageUrl: string | null;
  sourceUrl: string | null;
};

/** Open Beauty Facts par code-barre (v2). Gratuit, rapide. */
async function obfByBarcode(ean: string): Promise<Partial<Resolved> | null> {
  try {
    const url =
      `https://world.openbeautyfacts.org/api/v2/product/${encodeURIComponent(ean)}.json` +
      `?fields=product_name,brands,ingredients_text,ingredients_text_fr,image_url`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const r = await fetch(url, {
      headers: { "User-Agent": "Cosme-Check/1.0 (admin-resolve)", Accept: "application/json" },
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!r.ok) return null;
    const j = await r.json() as {
      status?: number;
      product?: { product_name?: string; brands?: string; ingredients_text?: string; ingredients_text_fr?: string; image_url?: string };
    };
    if (j.status !== 1 || !j.product) return null;
    const p = j.product;
    const inci = (p.ingredients_text_fr || p.ingredients_text || "").trim();
    return {
      name: p.product_name?.trim() || null,
      brand: p.brands?.split(",")[0]?.trim() || null,
      inci: inci.length >= 20 ? inci : null,
      imageUrl: p.image_url || null,
      sourceUrl: `https://world.openbeautyfacts.org/product/${ean}`,
    };
  } catch {
    return null;
  }
}

function extractJson(text: string): Record<string, unknown> | null {
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(text.slice(a, b + 1)) as Record<string, unknown>; } catch { return null; }
}

/** GPT web-search par code-barre → produit + catégorie précise. */
async function gptByBarcode(ean: string): Promise<Partial<Resolved> | null> {
  if (!hasOpenAI()) return null;
  const system = [
    "Tu identifies un produit cosmétique à partir de son CODE-BARRES (EAN) via la recherche web.",
    "RÈGLES :",
    "1. Cherche le produit correspondant EXACTEMENT à ce code-barres (fiches officielles/marchands).",
    "2. Donne nom, marque, liste INCI complète (telle qu'écrite), et la description marketing (pour analyser la promesse).",
    `3. Classe-le dans une catégorie PRÉCISE "Famille / Sous-catégorie / Type". Famille parmi : ${CANONICAL_FAMILIES.join(", ")}.`,
    "4. N'INVENTE RIEN. Si tu n'es pas sûr du produit, mets les champs inconnus à null.",
    "5. JSON STRICT sans markdown.",
    'Format : {"name":"…"|null,"brand":"…"|null,"inci":"…"|null,"description":"…"|null,"category":"Famille / Sous / Type"|null,"url":"https://…"|null}',
  ].join("\n");
  const userMsg = `Code-barres EAN : ${ean}\n\nIdentifie le produit cosmétique. JSON strict.`;
  try {
    const completion = await Promise.race([
      // deno-lint-ignore no-explicit-any
      openai().chat.completions.create({
        model: AI_MODEL_SEARCH,
        messages: [{ role: "system", content: system }, { role: "user", content: userMsg }],
        web_search_options: { search_context_size: "medium" },
      } as any),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 25_000)),
    ]);
    // deno-lint-ignore no-explicit-any
    const c = completion as any;
    const usage = c.usage ?? {};
    logAI({ feature: "product_search", provider: "openai", status: "success", model: AI_MODEL_SEARCH, tokens_in: usage.prompt_tokens ?? null, tokens_out: usage.completion_tokens ?? null });
    const parsed = extractJson(c.choices?.[0]?.message?.content ?? "");
    if (!parsed) return null;
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
    return {
      name: str(parsed.name),
      brand: str(parsed.brand),
      inci: ((s) => (s && s.length >= 20 ? s : null))(str(parsed.inci)),
      description: str(parsed.description),
      categoryPath: str(parsed.category),
      sourceUrl: ((u) => (u && u.startsWith("http") ? u.slice(0, 500) : null))(str(parsed.url)),
    };
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") return jsonResponse({ error: "Méthode non autorisée." }, { status: 405 });

  if (!isAdminCaller(req.headers.get("Authorization") ?? "")) {
    return jsonResponse({ error: "unauthorized" }, { status: 401 });
  }

  let ean: string;
  try {
    ean = String(((await req.json()) as { ean?: string }).ean ?? "").trim();
  } catch {
    return jsonResponse({ error: "Requête invalide." }, { status: 400 });
  }
  if (!ean) return jsonResponse({ ok: false, ean: "", reason: "EAN manquant." }, { status: 400 });

  // ── 1. Résolution produit : OBF (gratuit) puis GPT (catégorie + fallback). ──
  const obf = await obfByBarcode(ean);
  const gpt = await gptByBarcode(ean);

  const inci = (obf?.inci && obf.inci.length >= 20 ? obf.inci : null) ?? gpt?.inci ?? null;
  if (!inci || inci.length < 20) {
    return jsonResponse({ ok: false, ean, reason: "Produit/INCI introuvable" });
  }
  const name = obf?.name ?? gpt?.name ?? null;
  const brand = obf?.brand ?? gpt?.brand ?? null;
  const imageUrl = obf?.imageUrl ?? null;
  const sourceUrl = gpt?.sourceUrl ?? obf?.sourceUrl ?? null;
  const catSlug = slugifyCategoryPath(gpt?.categoryPath ?? null);

  // ── 2. Note + blocus (mêmes fonctions que l'analyser). ─────────────────────
  const tokens = parseInciList(inci);
  if (tokens.length === 0) {
    return jsonResponse({ ok: false, ean, reason: "INCI non parsable" });
  }
  const svc = serviceClient();
  const { data: matchData, error: matchErr } = await svc.rpc("cosme_check_match_inci_batch", {
    p_tokens: tokens.map((t) => t.normalized),
  });
  if (matchErr) return jsonResponse({ ok: false, ean, reason: "Échec matching INCI" });

  type MatchRow = { color_rating: ColorRating | null; position_idx: number };
  const matches = ((matchData ?? []) as MatchRow[]).map((r) => ({
    color_rating: r.color_rating,
    position: (r.position_idx ?? 0) + 1,
  }));
  const score = computeScore(matches, tokens.length);
  let countOrange = 0, countRouge = 0;
  for (const m of matches) {
    if (m.color_rating === "Orange") countOrange++;
    if (m.color_rating === "Rouge") countRouge++;
  }
  const { label, tone } = scoreLabel(score);

  // ── 3. Upsert catalogue (score brut ; le plafond s'applique à l'affichage). ─
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
  } catch (_e) {
    return jsonResponse({ ok: false, ean, reason: "Échec écriture catalogue" });
  }

  return jsonResponse({
    ok: true,
    ean,
    name,
    brand,
    score: Number(applyColorCap(score, countOrange, countRouge).toFixed(1)),
    rawScore: Number(score.toFixed(1)),
    scoreLabel: label,
    category: catSlug,
    countOrange,
    countRouge,
  });
});
