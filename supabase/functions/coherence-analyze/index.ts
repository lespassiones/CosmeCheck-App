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
  analyzeCoherence,
  generateConclusion,
  type FormulaItemForLlm,
} from "./lib/ai.ts";
import { buildCoherenceResult } from "./lib/engine.ts";
import { loadProfileAndRestrictions } from "./lib/profile.ts";
import type {
  AnalyseResponse,
  CoherencePromise,
  OutOfScopePromise,
  ProductType,
  UnverifiableClaim,
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
// demelage unifiés) + cache des conclusions par signature de profil.
// v5 = garde déterministe des MODES D'EMPLOI (usageInstructionGuard) : une
// consigne d'usage ("appliquer avant le coucher") n'est plus comptée comme une
// promesse "non démontrée" + règle prompt correspondante. Bumper invalide les
// entrées coherence_cache antérieures (verdicts potentiellement différents).
// v6 = analyse en UNE passe LLM (description + INCI → promesses vérifiées, le
// LLM cite les vrais ingrédients et écarte les claims non vérifiables). Remplace
// détection type + extraction + exploration + moteur déterministe d'actifs
// attendus (qui produisait de faux « non démontré » avec des actifs hors-sujet).
// v11 = passe LLM montée en gpt-4.1 + AJOUT d'une 2e passe CRITIQUE IA (relit
// l'extraction : anti-invention "sans X", promesses réellement mesurables,
// mapping INCI honnête, dédup). SUPPRESSION du filet déterministe NOISE (regex
// figée qui rabotait l'analyse) : c'est désormais la critique IA qui reclasse
// le non-mesurable. Bump invalide coherence_cache v10 (verdicts différents).
const ALGO_VERSION = "v11";

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
    const existingVer =
      (existing?.result_json as { algoVersion?: string } | null)?.algoVersion ?? null;
    // Lecture-pure UNIQUEMENT si le résultat a été calculé par la version
    // courante. Un résultat d'une version antérieure (ou non versionné) N'EST
    // PAS re-servi : on régénère sous v-courante (servi gratis depuis le cache
    // cross-user si dispo). Évite le cache empoisonné par l'ancien moteur.
    if (existing?.result_json && existingVer === ALGO_VERSION) {
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

    type CacheVal = {
      promises: CoherencePromise[];
      unverifiable: UnverifiableClaim[];
      outOfScope: OutOfScopePromise[];
      /** Conclusions déjà générées, par signature de personnalisation. */
      conclusions?: Record<string, string>;
    };

    let promises: CoherencePromise[];
    let unverifiable: UnverifiableClaim[];
    let outOfScope: OutOfScopePromise[];
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
      // MISS → analyse IA en UNE passe. Débit AVANT le travail IA.
      const charge = await g.consumeCredit("coherence");
      if (!charge.ok) return charge.response;

      const itemsForLlm: FormulaItemForLlm[] = parent.items
        .filter((it): it is typeof it & { slug: string; name: string } =>
          Boolean(it.slug) && Boolean(it.name),
        )
        .map((it) => ({
          slug: it.slug,
          name: it.name,
          primaryFunction: it.primaryFunction,
        }));

      const analysis = await analyzeCoherence(description, itemsForLlm, user.id);
      productType = analysis.productType;

      // Le LLM ne cite que des slugs de la formule réelle : on les rattache aux
      // items (position/inTrace) pour l'affichage et le positionSnapshot.
      const bySlug = new Map(parent.items.map((it) => [it.slug, it] as const));
      // Plus de filet déterministe NOISE : la 2e passe CRITIQUE IA
      // (analyzeCoherence, reviewCoherencePass) reclasse elle-même le
      // non-mesurable (périmètre, public, tolérance…) en "unverifiable". On ne
      // rabote plus l'analyse avec une regex figée.
      const built: CoherencePromise[] = [];
      for (const p of analysis.promises) {
        const foundActives = p.foundSlugs.flatMap((slug) => {
          const it = bySlug.get(slug);
          if (!it) return [];
          return [{
            name: it.name ?? slug,
            slug,
            position: it.position,
            inTrace: (it.thresholdContext ?? "").startsWith("after"),
          }];
        });

        let verdict = p.verdict;
        let score = p.score;
        let missing = p.missing;
        if (p.isAbsence) {
          // Une absence n'est jamais « non démontré » : tenue (X absent) ou
          // contredite (X présent, décidé par le LLM). On efface le « manque ».
          if (verdict !== "contredite") {
            verdict = "tenue";
            if (!score) score = 100;
          }
          missing = [];
        } else if (
          // Anti-hallucination : un verdict positif d'EFFET sans AUCUN ingrédient
          // réel cité retombe en « non démontré ».
          (verdict === "tenue" || verdict === "partielle") &&
          foundActives.length === 0
        ) {
          verdict = "non_demontree";
          score = 0;
        }
        const slug =
          p.label
            .toLowerCase()
            .normalize("NFD")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 40) || "autre";
        built.push({
          slug,
          label: p.label,
          excerpt: p.excerpt,
          verdict,
          expectedActives: [],
          foundActives,
          cosmeticActives: [],
          missingActives: missing,
          score,
        });
      }
      promises = built;
      unverifiable = analysis.unverifiable;
      outOfScope = [];
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
    result.algoVersion = ALGO_VERSION; // tampon anti-poison (lecture-pure versionnée)

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
