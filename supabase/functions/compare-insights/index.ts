/**
 * Edge Function `compare-insights` — port de
 * `CosmetWiki/app/api/compare/insights/route.ts` + `CosmetWiki/lib/ai/compare.ts`.
 *
 * Renvoie les portraits IA + "comment choisir ?" pour une paire d'analyses.
 *
 * Ordre des crédits IDENTIQUE au web : `apiGate({ feature: "compare.insights" })`
 * débite 1 crédit dans le gate (auth + rate-limit + crédit), AVANT le lookup
 * des analyses et le cache de paire. Ici : gate({ feature, costCredits: 1 }).
 *
 * Pipeline :
 *   1. gate (auth Bearer + rate-limit IP + débit 1 crédit).
 *   2. Validation { aId, bId } (présents, distincts).
 *   3. Lookup des 2 analyses via le client lié au token → RLS = ownership
 *      check (l'utilisateur ne voit que ses propres analyses). 404 si ≠ 2.
 *   4. Noms courts (shortenProductName) pour un récit naturel.
 *   5. generateCompareInsights : cache sha256 de paire (ai_cache, v4) →
 *      GPT-4o-mini → fallback Mistral. 503 si indisponible.
 *
 * Entrée : { aId, bId } (POST body). Sortie : { portraitA, portraitB, common,
 * howToChoose }. Crédit 1.
 */
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { gate } from "../_shared/gate.ts";
import {
  type AnalyseResultLike,
  generateCompareInsights,
  shortenProductName,
} from "./lib.ts";
import { loadProfileAndRestrictions, loadRestrictionsForDetection } from "./lib/profile.ts";
import { checkRestrictions, detectedLabels, type CheckableItem } from "./lib/checkRestrictions.ts";

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  // 1. Auth + rate-limit + débit 1 crédit (ordre identique au web apiGate).
  const g = await gate(req, { feature: "compare.insights", costCredits: 1 });
  if (!g.ok) return g.response;
  const { user, supabase: sb } = g;

  // 2. Validation des ids.
  let aId = "";
  let bId = "";
  try {
    const body = (await req.json()) as { aId?: string; bId?: string };
    aId = (body.aId ?? "").trim();
    bId = (body.bId ?? "").trim();
  } catch {
    return jsonResponse({ error: "Invalid ids" }, { status: 400 });
  }
  if (!aId || !bId || aId === bId) {
    return jsonResponse({ error: "Invalid ids" }, { status: 400 });
  }

  try {
    // 3. Lookup des 2 analyses. Le client lié au token applique la RLS :
    // l'utilisateur ne récupère que SES analyses → ownership check implicite.
    const { data } = await sb
      .schema("cosme_check")
      .from("analyses")
      .select("id, name, product_label, result_json")
      .in("id", [aId, bId]);

    const rows = (data ?? []) as {
      id: string;
      name: string | null;
      product_label: string | null;
      result_json: AnalyseResultLike;
    }[];
    if (rows.length !== 2) {
      return jsonResponse({ error: "Not found" }, { status: 404 });
    }

    const a = rows.find((r) => r.id === aId);
    const b = rows.find((r) => r.id === bId);
    if (!a || !b) {
      return jsonResponse({ error: "Not found" }, { status: 404 });
    }

    // 4. Noms courts pour un récit naturel (cohérent avec le frontend).
    const rawA = a.product_label ?? a.name ?? "Produit A";
    const rawB = b.product_label ?? b.name ?? "Produit B";
    const shortA = shortenProductName(rawA);
    const shortB = shortenProductName(rawB);

    // 5. Profil utilisateur (best-effort, non-bloquant).
    const { profileBlock, restrictionsBlock, firstName } = await loadProfileAndRestrictions(sb, user.id);

    // 5b. Détection DÉTERMINISTE des restrictions par produit (mêmes règles que
    // les fiches : checkRestrictions par tag/slug). On donne la vérité terrain à
    // l'IA au lieu de la laisser deviner (elle affirmait à tort « aucun interdit »).
    const { restrictions, families } = await loadRestrictionsForDetection(sb, user.id);
    const itemsA = (a.result_json?.items ?? []) as unknown as CheckableItem[];
    const itemsB = (b.result_json?.items ?? []) as unknown as CheckableItem[];
    const detectedA = detectedLabels(checkRestrictions(itemsA, restrictions, families));
    const detectedB = detectedLabels(checkRestrictions(itemsB, restrictions, families));

    const insights = await generateCompareInsights(
      { name: shortA, result: a.result_json },
      { name: shortB, result: b.result_json },
      { userId: user.id, profileBlock, restrictionsBlock, firstName, detectedA, detectedB },
    );

    if (!insights) {
      return jsonResponse({ error: "Unavailable" }, { status: 503 });
    }

    return jsonResponse(insights, { headers: { "Cache-Control": "private, max-age=3600" } });
  } catch {
    return jsonResponse({ error: "Erreur lors de la comparaison." }, { status: 500 });
  }
});
