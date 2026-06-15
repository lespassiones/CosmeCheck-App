/**
 * Edge Function `coherence-analyze` — port du pipeline "Promesses vs Formule"
 * web (CosmetWiki/app/api/coherence/route.ts + lib/coherence/* + lib/ai/coherence.ts).
 *
 * Input  : { analysis_id, description }
 * Output : { id, result }
 *
 * Ordre (IDENTIQUE au web) :
 *   1. Auth Bearer + rate-limit IP (gate, costCredits:0 — pas de débit ici).
 *   2. Idempotence (hash {user, route, body}) → réponse cachée si rejouée
 *      (évite le double-débit sur double-clic).
 *   3. Débit de 1 crédit (consumeCredit "coherence") APRÈS le lookup idempotent.
 *   4. Pipeline :
 *        Step 0 : detectProductType        (IA, gpt-4o-mini json_schema → Mistral)
 *        Step 1 : extractPromisesFromDescription (IA) + reclassify + dedup (déterministe)
 *        Step 2 : split catalogue effect / catalogue absence / open (déterministe)
 *        Step 3 : exploreOpenPromise        (IA, 1 appel par promesse "autre", en parallèle)
 *        Step 4 : buildCoherenceResult      (moteur déterministe)
 *        Step 5 : generateConclusion        (IA, ne voit que les verdicts) + profil/restrictions
 *   5. Insert dans cosme_check.coherence_analyses (client user → RLS).
 *
 * Dégrade sans clé IA : detectProductType → "autre", extraction → vide,
 * conclusion → fallback déterministe. La fonction renvoie toujours un résultat.
 */
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { gate } from "../_shared/gate.ts";
import { serviceClient } from "../_shared/auth.ts";
import { sha256Hex } from "../_shared/aiClient.ts";
import {
  detectProductType,
  exploreOpenPromise,
  extractPromisesFromDescription,
  generateConclusion,
  type FormulaItemForLlm,
} from "./lib/ai.ts";
import {
  buildCoherenceResult,
  dedupProposals,
  reclassifyOpenProposals,
  resolveAbsencePromise,
  resolveOpenPromise,
  resolvePromise,
} from "./lib/engine.ts";
import { findCategoryBySlug, isAbsenceCategory } from "./lib/claims.ts";
import { loadProfileAndRestrictions } from "./lib/profile.ts";
import type {
  AnalyseResponse,
  CoherencePromise,
  ProductType,
} from "./lib/types.ts";

type Body = {
  analysis_id?: string;
  description?: string;
  /**
   * `false` quand la promesse a été COLLÉE manuellement par l'utilisateur →
   * on ne met PAS le résultat en cache cross-user (texte perso, non partageable).
   * Défaut `true` (promesse récupérée automatiquement, identique pour tous).
   */
  cacheable?: boolean;
};

// ─── Idempotence (port de CosmetWiki/lib/idempotency.ts, Deno) ──────────────
const IDEM_TTL_MS = 24 * 60 * 60 * 1000;
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}
async function idempotencyKey(userId: string, route: string, body: unknown): Promise<string> {
  const hash = (await sha256Hex(stableStringify(body))).slice(0, 24);
  return `${route}:${userId}:${hash}`;
}
async function idempotencyLookup(key: string): Promise<unknown | null> {
  try {
    const svc = serviceClient();
    const { data } = await svc
      .schema("cosme_check")
      .from("idempotency")
      .select("response, created_at")
      .eq("key", key)
      .maybeSingle();
    if (!data) return null;
    const age = Date.now() - new Date(data.created_at as string).getTime();
    if (age > IDEM_TTL_MS) return null;
    return data.response;
  } catch {
    return null;
  }
}
async function idempotencyStore(key: string, body: unknown): Promise<void> {
  try {
    const svc = serviceClient();
    await svc
      .schema("cosme_check")
      .from("idempotency")
      .upsert(
        { key, response: body, status_code: 200, created_at: new Date().toISOString() },
        { onConflict: "key" },
      );
  } catch {
    // best-effort
  }
}

Deno.serve(async (req: Request) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Méthode non autorisée." }, { status: 405 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return jsonResponse({ error: "Requête invalide." }, { status: 400 });
  }

  const analysisId = (body.analysis_id ?? "").trim();
  const description = (body.description ?? "").trim();
  const cacheable = body.cacheable !== false;
  if (!analysisId) {
    return jsonResponse({ error: "analysis_id manquant." }, { status: 400 });
  }
  if (description.length < 30) {
    return jsonResponse(
      { error: "Description trop courte (au moins 30 caractères)." },
      { status: 400 },
    );
  }
  if (description.length > 6000) {
    return jsonResponse(
      { error: "Description trop longue (max 6000 caractères)." },
      { status: 400 },
    );
  }

  // ── 1. Auth + rate-limit IP, SANS débit (mirror web) ────────────────────
  const g = await gate(req, { feature: "coherence", costCredits: 0 });
  if (!g.ok) return g.response;
  const { user, supabase: sb } = g;

  // ── 2. Idempotence (avant tout débit) ───────────────────────────────────
  const idemKey = await idempotencyKey(user.id, "coherence", { analysisId, description });
  const cached = await idempotencyLookup(idemKey);
  if (cached) {
    return jsonResponse(cached, { headers: { "X-Idempotent-Replay": "1" } });
  }

  // ── 3. Débit de 1 crédit (APRÈS le lookup idempotent) → 429 si épuisé ───
  const charge = await g.consumeCredit("coherence");
  if (!charge.ok) return charge.response;

  try {
    // Look up the parent analysis (RLS + explicit user_id belt-and-braces).
    const { data: analysisRow, error: analysisErr } = await sb
      .schema("cosme_check")
      .from("analyses")
      .select("id, user_id, name, product_label, product_type, brand, result_json")
      .eq("id", analysisId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (analysisErr || !analysisRow) {
      return jsonResponse(
        { error: "Analyse INCI introuvable ou inaccessible." },
        { status: 404 },
      );
    }

    const parent = analysisRow.result_json as AnalyseResponse;
    if (!parent || !Array.isArray(parent.items) || parent.items.length === 0) {
      return jsonResponse(
        { error: "L'analyse INCI source est invalide ou vide." },
        { status: 400 },
      );
    }

    const productLabel =
      (analysisRow.product_label as string | null) ??
      (analysisRow.name as string | null) ??
      null;

    // ─── Cache cross-user (par formule INCI + promesse) ───────────────────
    // Steps 0-3 (détection type, extraction, exploration) ne dépendent QUE de
    // (formule, description) → cache cross-user dans coherence_cache. La
    // conclusion (Step 5) est personnalisée → toujours recalculée. On NE cache
    // PAS une promesse collée manuellement (cacheable=false).
    const inciHash = (await sha256Hex(
      parent.items
        .map((it) => (it.slug || it.name || ""))
        .filter(Boolean)
        .sort()
        .join("|"),
    )).slice(0, 40);
    const descHash = (await sha256Hex(description.toLowerCase())).slice(0, 40);

    type Extraction = Awaited<ReturnType<typeof extractPromisesFromDescription>>;
    type CacheVal = {
      promises: CoherencePromise[];
      unverifiable: Extraction["unverifiable"];
      outOfScope: Extraction["outOfScope"];
    };

    let promises: CoherencePromise[];
    let unverifiable: Extraction["unverifiable"];
    let outOfScope: Extraction["outOfScope"];
    let productType: ProductType;

    const cacheRead = await sb
      .schema("cosme_check")
      .from("coherence_cache")
      .select("result_json, product_type")
      .eq("inci_hash", inciHash)
      .eq("description_hash", descHash)
      .maybeSingle();
    const cachedVal = (cacheRead.data as
      | { result_json: CacheVal; product_type: string | null }
      | null) ?? null;

    if (cachedVal && Array.isArray(cachedVal.result_json?.promises)) {
      // HIT cross-user : on saute les LLM coûteux (steps 0-3).
      promises = cachedVal.result_json.promises;
      unverifiable = cachedVal.result_json.unverifiable;
      outOfScope = cachedVal.result_json.outOfScope;
      productType = (cachedVal.product_type ?? "autre") as ProductType;
    } else {
      // ─── Step 0: detect product type (silent LLM call). ─────────────────
      const typeHint = [
        analysisRow.product_type as string | null,
        productLabel,
        analysisRow.brand as string | null,
      ]
        .filter((s): s is string => Boolean(s && s.trim()))
        .join(" - ");
      productType = await detectProductType(description, typeHint || null, user.id);

      // ─── Step 1: extract promises (LLM, JSON schema) ────────────────────
      const extraction = await extractPromisesFromDescription(
        description,
        productType,
        user.id,
      );
      const reclassifiedProposals = reclassifyOpenProposals(
        extraction.proposals,
        productType,
      );
      const dedupedProposals = dedupProposals(reclassifiedProposals);

      // ─── Step 2: split catalogue (effect) / catalogue (absence) / open ──
      const cataloguePromises: CoherencePromise[] = [];
      const openProposals: typeof extraction.proposals = [];
      for (const p of dedupedProposals) {
        const cat = findCategoryBySlug(p.category_slug);
        if (cat && isAbsenceCategory(cat)) {
          cataloguePromises.push(resolveAbsencePromise(p, cat, parent.items));
        } else if (cat) {
          cataloguePromises.push(resolvePromise(p, parent.items));
        } else {
          openProposals.push(p);
        }
      }

      // ─── Step 3: open promises - explore the formula via LLM in parallel ─
      const itemsForLlm: FormulaItemForLlm[] = parent.items
        .filter((it): it is typeof it & { slug: string; name: string } =>
          Boolean(it.slug) && Boolean(it.name),
        )
        .map((it) => ({
          slug: it.slug,
          name: it.name,
          primaryFunction: it.primaryFunction,
        }));

      const openPromises: CoherencePromise[] = await Promise.all(
        openProposals.map(async (p) => {
          const exploration = await exploreOpenPromise(
            p.label,
            p.excerpt,
            itemsForLlm,
            user.id,
          );
          return resolveOpenPromise(p, parent.items, exploration.matches, exploration.missing);
        }),
      );

      promises = [...cataloguePromises, ...openPromises];
      unverifiable = extraction.unverifiable;
      outOfScope = extraction.outOfScope;

      // Écriture cache cross-user (sauf promesse collée).
      if (cacheable) {
        const val: CacheVal = { promises, unverifiable, outOfScope };
        await sb
          .schema("cosme_check")
          .from("coherence_cache")
          .upsert(
            {
              inci_hash: inciHash,
              description_hash: descHash,
              result_json: val,
              product_type: productType,
              algo_version: "v1",
            },
            { onConflict: "inci_hash,description_hash" },
          );
      }
    }

    // ─── Step 5: conclusion (LLM, only sees verdicts) + personnalisation ──
    const { profileBlock, restrictionsBlock } = await loadProfileAndRestrictions(
      sb,
      user.id,
    );
    const conclusion = await generateConclusion(
      promises,
      productLabel,
      user.id,
      profileBlock,
      restrictionsBlock,
    );

    // ─── Step 4: build the full structured result (engine, deterministic) ─
    const result = buildCoherenceResult({
      description,
      promises,
      unverifiable,
      outOfScope,
      productType,
      parent,
      conclusion,
    });

    // ─── Persist ──────────────────────────────────────────────────────────
    const { data: saved, error: saveErr } = await sb
      .schema("cosme_check")
      .from("coherence_analyses")
      .insert({
        user_id: user.id,
        analysis_id: analysisId,
        description,
        result_json: result,
      })
      .select("id")
      .single();

    if (saveErr || !saved) {
      return jsonResponse(
        { error: "Échec de sauvegarde de l'analyse de cohérence." },
        { status: 500 },
      );
    }

    const finalBody = { id: saved.id, result };
    await idempotencyStore(idemKey, finalBody);
    return jsonResponse(finalBody);
  } catch (_err) {
    return jsonResponse(
      { error: "Erreur lors de l'analyse de cohérence." },
      { status: 500 },
    );
  }
});
