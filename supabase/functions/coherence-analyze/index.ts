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

// Version du moteur de cohérence. v4 = resynchronisation stricte des 3 copies
// (dual-use Annexe III 3 slugs + formulaHasDeclaredFragrance + keywords
// demelage unifiés) + cache des conclusions par signature de profil. Bumper
// invalide les entrées coherence_cache antérieures (verdicts potentiellement
// différents).
const ALGO_VERSION = "v4";

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

  // NOTE CRÉDIT : le débit n'a plus lieu ici. Il est déclenché plus bas,
  // UNIQUEMENT quand un nouveau service est rendu à CE user. La ré-analyse
  // du même produit par le même user = pure lecture (0 IA, 0 crédit).

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

    // ─── RÉ-ANALYSE = PURE LECTURE (même user, même produit, même promesse) ─
    // Si CE user a déjà une analyse de cohérence pour cette analyse INCI avec
    // la MÊME description → on renvoie l'existante telle quelle. 0 appel IA,
    // 0 crédit, 1 SELECT. C'est le contrat "réanalyser = juste une lecture".
    const { data: existingRows } = await sb
      .schema("cosme_check")
      .from("coherence_analyses")
      .select("id, result_json")
      .eq("user_id", user.id)
      .eq("analysis_id", analysisId)
      .eq("description", description)
      .order("created_at", { ascending: false })
      .limit(1);
    const existing = existingRows?.[0] ?? null;
    if (existing?.result_json) {
      const replayBody = { id: existing.id, result: existing.result_json, cache: "user" };
      return jsonResponse(replayBody, { headers: { "X-Coherence-Cache": "user" } });
    }

    // ─── Cache cross-user (par formule INCI + promesse) ───────────────────
    // Steps 0-3 (détection type, extraction, exploration) ne dépendent QUE de
    // (formule, description) → cache cross-user dans coherence_cache. La
    // conclusion (Step 5) est personnalisée par profil → cachée PAR SIGNATURE
    // de profil dans result_json.conclusions (map sig → texte). Un produit déjà
    // analysé = 0 appel IA, même pour la conclusion si un profil identique est
    // déjà passé. On NE cache PAS une promesse collée manuellement
    // (cacheable=false).
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
      /** Conclusions déjà générées, par signature de personnalisation. */
      conclusions?: Record<string, string>;
    };

    let promises: CoherencePromise[];
    let unverifiable: Extraction["unverifiable"];
    let outOfScope: Extraction["outOfScope"];
    let productType: ProductType;

    // Profil + restrictions chargés EN PARALLÈLE du cache (au lieu d'après le
    // pipeline) : nécessaires pour la signature de conclusion et la génération.
    // ⚠️ coherence_cache DOIT être lu/écrit via le client SERVICE : le client
    // user n'a pas les grants (l'upsert v3 échouait silencieusement depuis le
    // début → table restée vide, 0 hit cross-user en prod).
    const svc = serviceClient();
    const [cacheRead, personal] = await Promise.all([
      svc
        .schema("cosme_check")
        .from("coherence_cache")
        .select("result_json, product_type")
        .eq("inci_hash", inciHash)
        .eq("description_hash", descHash)
        .eq("algo_version", ALGO_VERSION)
        .maybeSingle(),
      loadProfileAndRestrictions(sb, user.id),
    ]);
    const { profileBlock, restrictionsBlock } = personal;
    const personalSig = (await sha256Hex(
      `${profileBlock ?? ""}|${restrictionsBlock ?? ""}`,
    )).slice(0, 16);

    const cachedVal = (cacheRead.data as
      | { result_json: CacheVal; product_type: string | null }
      | null) ?? null;

    let cacheState: "full" | "partial" | "miss" = "miss";
    let cachedConclusion: string | null = null;

    if (cachedVal && Array.isArray(cachedVal.result_json?.promises)) {
      // HIT cross-user : on saute les LLM coûteux (steps 0-3).
      promises = cachedVal.result_json.promises;
      unverifiable = cachedVal.result_json.unverifiable;
      outOfScope = cachedVal.result_json.outOfScope;
      productType = (cachedVal.product_type ?? "autre") as ProductType;
      cachedConclusion = cachedVal.result_json.conclusions?.[personalSig] ?? null;
      cacheState = cachedConclusion ? "full" : "partial";
      // Cache cross-user HIT → PAS de débit (même règle que `analyser` sur
      // cache EAN : on ne facture que le pipeline IA complet).
    } else {
      // MISS → pipeline complet. Débit AVANT le travail IA.
      const charge = await g.consumeCredit("coherence");
      if (!charge.ok) return charge.response;

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

      // ─── Step 2: absence (déterministe, par tag) vs effet (LLM + validation) ──
      // TOUTE promesse d'effet passe désormais par le chemin LLM qui valide chaque
      // ingrédient cité contre la formule réelle (anti-hallucination). Plus de liste
      // blanche d'actifs figée : elle ratait les actifs botaniques/ayurvédiques et
      // produisait des « non démontré » à tort. Seules les promesses « sans X »
      // restent déterministes (vérification par tag dans la formule).
      const cataloguePromises: CoherencePromise[] = [];
      const openProposals: typeof extraction.proposals = [];
      for (const p of dedupedProposals) {
        const cat = findCategoryBySlug(p.category_slug);
        if (cat && isAbsenceCategory(cat)) {
          cataloguePromises.push(resolveAbsencePromise(p, cat, parent.items));
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
    }

    // ─── Step 5: conclusion (LLM, only sees verdicts) + personnalisation ──
    // Servie depuis le cache si un profil identique est déjà passé (0 IA).
    const conclusion = cachedConclusion ??
      (await generateConclusion(
        promises,
        productLabel,
        user.id,
        profileBlock,
        restrictionsBlock,
      ));

    // Écriture/mise à jour du cache cross-user (sauf promesse collée) : steps
    // 0-3 + la conclusion de CE profil (map bornée aux 20 dernières signatures).
    if (cacheable && cacheState !== "full") {
      const prevConclusions = cachedVal?.result_json?.conclusions ?? {};
      const conclusionEntries = [
        ...Object.entries(prevConclusions).filter(([k]) => k !== personalSig),
        [personalSig, conclusion] as const,
      ].slice(-20);
      const val: CacheVal = {
        promises,
        unverifiable,
        outOfScope,
        conclusions: Object.fromEntries(conclusionEntries),
      };
      const { error: cacheWriteErr } = await svc
        .schema("cosme_check")
        .from("coherence_cache")
        .upsert(
          {
            inci_hash: inciHash,
            description_hash: descHash,
            result_json: val,
            product_type: productType,
            algo_version: ALGO_VERSION,
          },
          { onConflict: "inci_hash,description_hash" },
        );
      if (cacheWriteErr) {
        console.error("coherence_cache upsert failed:", cacheWriteErr.message);
      }
    }

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

    const finalBody = { id: saved.id, result, cache: cacheState };
    await idempotencyStore(idemKey, finalBody);
    return jsonResponse(finalBody, { headers: { "X-Coherence-Cache": cacheState } });
  } catch (_err) {
    return jsonResponse(
      { error: "Erreur lors de l'analyse de cohérence." },
      { status: 500 },
    );
  }
});
