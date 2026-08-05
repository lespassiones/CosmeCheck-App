/**
 * Edge Function `analyser` — port du pipeline d'analyse INCI web
 * (`CosmetWiki/app/api/analyser/route.ts`) vers Supabase Edge (Deno).
 *
 * Pipeline (ordre IDENTIQUE au web) :
 *   1. Auth Bearer + rate-limit IP (gate, costCredits:0 — pas de débit ici).
 *   2. Idempotence (hash {user, route, body}) → réponse cachée si rejouée.
 *   3. Cache EAN `product_analyses` → court-circuit.
 *   4. AUCUN débit de crédit : le scan/analyse est GRATUIT par décision produit
 *      (seul le rate-limit IP protège l'abus). La monétisation se fait en aval
 *      (3 blocs IA / synthèse personnalisée = 1 crédit, lazy). Ne PAS ajouter
 *      de consumeCredit ici sans changer aussi le paywall côté app.
 *   5. Fast-path déterministe `isCleanInciInput` : parse local + match DB +
 *      score, SANS aucun appel LLM. Sinon cascade IA (parse/validate/split),
 *      qui dégrade gracieusement si les clés IA manquent.
 *   6. Match DB (cosme_check_match_inci_batch) + correction typo IA (trigram +
 *      LLM), dédup, comptes, score, tags, observations, allergènes UE,
 *      seuils, spectre, catégorie LLM, synthèse LLM optionnelle.
 *   7. Persiste dans cosme_check.analyses (client lié au user → RLS) ;
 *      routine_items si addToRoutine ; cache EAN + catalog en service-role.
 *
 * Sortie : AnalyseResponse + { analysisId, addedToRoutine } (match web).
 */
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { gate } from "../_shared/gate.ts";
import { serviceClient } from "../_shared/auth.ts";
import { getCatalogInfo } from "./catalog.ts";
import { dedupeKey } from "../_shared/dedupeKey.ts";
import { sha256Hex } from "../_shared/aiClient.ts";
import { type ColorRating, pastilleTone, reconcileScore, type ScoreTone, scoreLabel, synthScore } from "./score.ts";
import { isCleanInciInput, parseInciList } from "./parse.ts";
import {
  buildAnalysisCore,
  type MatchRow,
  recomputeThresholdContext,
  type ThresholdItem,
} from "./core.ts";
import {
  normalizeProductTypeToCategory,
  type ProductCategory,
} from "./engine.ts";
import {
  categorizeProduct,
  classifyPreciseCategory,
  correctTypo,
  generateSynthesis,
  parseInciWithAI,
  splitInciWithGpt,
  validateInciInput,
} from "./ai.ts";
import {
  checkRestrictions,
  loadProfileForPrompt,
  loadRestrictionsContext,
} from "./personalization.ts";

type AnalysePayload = {
  text?: string;
  hp?: string;
  withSynthesis?: boolean;
  productLabel?: string;
  brand?: string;
  productType?: string;
  addToRoutine?: boolean;
  productEan?: string;
};

// (Constantes d'assemblage TAG_LABELS / ABSENCE_REPORTED / WATER_NAMES / seuils /
//  Observation / ThresholdItem / recomputeThresholdContext : DÉPLACÉES dans
//  ./core.ts — logique partagée avec le script de backfill product_analyses.)

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
      .select("response, status_code, created_at")
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

  let body: AnalysePayload;
  try {
    body = (await req.json()) as AnalysePayload;
  } catch {
    return jsonResponse({ error: "Requête invalide." }, { status: 400 });
  }

  // Honey-pot anti-bot.
  if (body.hp && body.hp.length > 0) {
    return jsonResponse({ error: "Forbidden" }, { status: 403 });
  }

  const rawText = (body.text ?? "").slice(0, 8000);
  if (!rawText.trim()) {
    return jsonResponse({ error: "Liste vide." }, { status: 400 });
  }

  // ── 1. Auth + rate-limit IP, SANS débit de crédit (mirror web) ──────────
  const g = await gate(req, { feature: "analyser", costCredits: 0 });
  if (!g.ok) return g.response;
  const { user, supabase: sbAuth } = g;

  // ── 2. Idempotence ──────────────────────────────────────────────────────
  const idemKey = await idempotencyKey(user.id, "analyser", {
    text: rawText,
    productLabel: body.productLabel ?? null,
    brand: body.brand ?? null,
    productType: body.productType ?? null,
    withSynthesis: body.withSynthesis !== false,
    addToRoutine: body.addToRoutine === true,
  });
  const cached = await idempotencyLookup(idemKey);
  if (cached) {
    return jsonResponse(cached, { headers: { "X-Idempotent-Replay": "1" } });
  }

  // ── 3. Produit catalogué : INCI AUTORITAIRE + cache EAN pré-calculé ─────
  const productEan = body.productEan?.trim() || null;

  // SOURCE DE VÉRITÉ INCI (fix 14 juil 2026) : pour un EAN catalogué, on
  // n'analyse PAS aveuglément le texte envoyé par le client — il peut être
  // tronqué (bug web ProductBrowsePage : INCI coupé à 200 car. dans l'URL →
  // listes à 9 ingrédients "tout vert"). On lit l'INCI COMPLET du catalogue et
  // on ne garde le texte client QUE s'il est plus complet (ligne catalogue
  // incomplète/stub) ou si le catalogue n'a pas d'INCI exploitable.
  const catalogInfo = productEan ? await getCatalogInfo(productEan) : null;
  let effectiveText = rawText;
  if (catalogInfo?.ingredientsText) {
    const catTokenCount = parseInciList(catalogInfo.ingredientsText).length;
    const clientTokenCount = parseInciList(rawText).length;
    if (catTokenCount >= 5 && catTokenCount >= clientTokenCount) {
      effectiveText = catalogInfo.ingredientsText.slice(0, 8000);
    }
  }

  if (productEan) {
    try {
      const svc = serviceClient();
      const { data: precomputed } = await svc.rpc("cosme_check_get_product_analysis", { p_ean: productEan });
      const cachedResult = (precomputed ?? null) as Record<string, unknown> | null;
      const cachedItems = (cachedResult && Array.isArray(cachedResult.items)
        ? cachedResult.items
        : []) as ThresholdItem[];
      // Garde anti-cache-corrompu : un batch ETL (v1.1) a écrit des analyses
      // tronquées (souvent 1 seul item) alors que l'INCI réel en compte bien plus.
      // Si le cache a nettement moins d'ingrédients que la liste de référence, on
      // l'IGNORE et on recalcule depuis le bon INCI (re-cache propre ensuite).
      const inputTokenCount = parseInciList(effectiveText).length;
      const cacheTrustworthy = inputTokenCount < 5 || cachedItems.length >= inputTokenCount * 0.5;
      if (cachedResult && cacheTrustworthy) {
        cachedResult.items = recomputeThresholdContext(cachedItems);
        cachedResult.synthesis = null;

        // GARANTIE D'INTÉGRITÉ : le cache product_analyses peut être incomplet
        // (certaines lignes ETL n'ont QUE `items`). On (re)calcule TOUJOURS les
        // comptes depuis items, sinon le result_json persisté sort sans `counts`
        // → l'écran d'analyse affiche « illisible ». (bug juin 2026)
        const cnt: Record<string, number> = { Vert: 0, Jaune: 0, Orange: 0, Rouge: 0, "Non reconnu": 0 };
        for (const it of cachedItems) {
          const c = (it as { colorRating?: ColorRating | null }).colorRating ?? null;
          if (c === "Vert" || c === "Jaune" || c === "Orange" || c === "Rouge") cnt[c]++;
          else cnt["Non reconnu"]++;
        }
        cachedResult.counts = {
          total: cachedItems.length,
          matched: cachedItems.length - cnt["Non reconnu"],
          vert: cnt.Vert,
          jaune: cnt.Jaune,
          orange: cnt.Orange,
          rouge: cnt.Rouge,
          unknown: cnt["Non reconnu"],
        };

        // Spectre (5/10 premières positions) : le cache n'a pas toujours `spectrum`.
        const bySpec = [...cachedItems].sort(
          (a, b) =>
            Number((a as { position?: number }).position ?? 0) -
            Number((b as { position?: number }).position ?? 0),
        );
        const pickSpec = (n: number) =>
          Array.from(
            { length: Math.min(n, bySpec.length) },
            (_, i) => (bySpec[i] as { colorRating?: ColorRating | null }).colorRating ?? null,
          );
        const existingSpec = cachedResult.spectrum as { top5?: unknown[] } | null | undefined;
        if (!existingSpec || !Array.isArray(existingSpec.top5) || existingSpec.top5.length === 0) {
          cachedResult.spectrum = { top5: pickSpec(5), top10: pickSpec(10) };
        }

        // SCORE = source de vérité catalogue CosmeCheck si dispo. On ne sert
        // JAMAIS le score calculé en cache pour un produit présent au catalogue.
        // (catalogInfo déjà chargé en amont — un seul fetch par requête.)
        const catScore = catalogInfo?.score ?? null;
        // Catégorie catalogue = source de vérité (comme le score) : on l'impose au
        // résultat caché pour ne jamais resservir une catégorie dérivée obsolète.
        if (catalogInfo?.category) {
          cachedResult.category = catalogInfo.category;
          cachedResult.catalogCategory = catalogInfo.category;
        }
        if (catScore != null) {
          // Réconciliation : le score catalogue peut avoir été calculé avec un
          // coloriage différent. On recalcule le score live depuis les couleurs
          // des items cachés (celles affichées) ; s'il tombe dans une bande
          // différente, on sert le live (note = couleurs vues). Garde >=50%.
          const past = pastilleTone(
            cachedItems.map((it) => ({
              color: (it as { colorRating?: ColorRating | null }).colorRating ?? null,
              position: Number((it as { position?: number }).position ?? 0),
            })),
            cachedItems.length,
            false,
          );
          const cnts = cachedResult.counts as { total?: number; matched?: number } | undefined;
          const chosen = reconcileScore(
            catScore,
            synthScore(past),
            cnts?.matched ?? 0,
            cnts?.total ?? cachedItems.length,
          );
          const { label, tone } = scoreLabel(chosen);
          cachedResult.score = chosen;
          cachedResult.scoreLabel = label;
          cachedResult.scoreTone = tone;
        } else if (typeof cachedResult.score !== "number") {
          // Pas de score catalogue ET cache sans score → pastille propriétaire
          // (couleur + position + composition) synthétisée en score, plutôt que
          // de persister un result_json sans `score`.
          const past = pastilleTone(
            cachedItems.map((it) => ({
              color: (it as { colorRating?: ColorRating | null }).colorRating ?? null,
              position: Number((it as { position?: number }).position ?? 0),
            })),
            cachedItems.length,
            false,
          );
          const computed = synthScore(past) ?? 0;
          const { label, tone } = scoreLabel(computed);
          cachedResult.score = computed;
          cachedResult.scoreLabel = label;
          cachedResult.scoreTone = tone;
        }

        let savedAnalysisId: string | null = null;
        try {
          const autoName = body.productLabel?.slice(0, 200)
            ?? `Analyse du ${new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}`;
          // Upsert dédupliqué : ré-analyser le même produit met à jour la ligne
          // existante (pas de doublon dans l'historique).
          const { data: upsertedId } = await sbAuth.rpc("cosme_check_upsert_analysis", {
            p_name: autoName,
            p_product_label: body.productLabel?.slice(0, 200) ?? null,
            p_brand: body.brand?.slice(0, 120) ?? null,
            p_product_type: body.productType?.slice(0, 120) ?? null,
            p_category: (cachedResult.category as string | null) ?? null,
            p_input_text: effectiveText,
            p_result_json: cachedResult,
            p_score: Number(((cachedResult.score as number) ?? 0).toFixed(2)),
            p_ean: productEan?.slice(0, 32) ?? null,
          });
          savedAnalysisId = (upsertedId as string) ?? null;
        } catch { /* l'échec d'historique ne bloque pas la réponse */ }

        return jsonResponse({ ...cachedResult, analysisId: savedAnalysisId, addedToRoutine: false });
      }
    } catch { /* cache miss → pipeline complet */ }
  }

  // ── 4. Analyse GRATUITE (déterministe) ──────────────────────────────────
  // L'analyse (score, classement, restrictions, liste d'ingrédients) ne débite
  // plus de crédit : seule la personnalisation IA (Edge `personal-insights`,
  // les 3 encarts perso) coûte 1 crédit. Permet à un utilisateur à 0 crédit de
  // voir le classement + les restrictions d'un produit.

  // ── 5. Fast-path déterministe vs cascade IA ─────────────────────────────
  // `effectiveText` = INCI catalogue (autoritaire) pour un EAN connu, sinon le
  // texte client. Un INCI catalogue est propre → fast-path déterministe.
  const skipAiParse = isCleanInciInput(effectiveText);

  let text: string;
  if (skipAiParse) {
    text = effectiveText;
  } else {
    const aiParsed = await parseInciWithAI(effectiveText, user.id);
    text = aiParsed && aiParsed.ingredients.length > 0 ? aiParsed.ingredients.join(", ") : effectiveText;
    // La garde « est-ce vraiment une liste INCI ? » protège la saisie MANUELLE
    // libre (éviter d'analyser du texte quelconque). Un produit CONNU du catalogue
    // / code-barres (productEan présent) a une composition LÉGITIME même très
    // courte (ex. patch anti-boutons « NIACINAMIDE, ZINC ») → on ne le rejette
    // JAMAIS pour cause de longueur/format : on analyse ce qu'on a.
    if (!productEan) {
      const validation = await validateInciInput(text, user.id);
      if (!validation.valid) {
        return jsonResponse(
          { error: validation.reason ?? "Ceci ne ressemble pas à une liste INCI." },
          { status: 400 },
        );
      }
    }
  }

  let tokens = parseInciList(text);

  // Rescue split (non-clean uniquement).
  if (!skipAiParse && tokens.length < 3 && text.length > 60) {
    const split = await splitInciWithGpt(text);
    if (split) {
      const rescued = parseInciList(split);
      if (rescued.length > tokens.length) tokens = rescued;
    }
  }

  if (tokens.length === 0) {
    return jsonResponse({ error: "Aucun ingrédient détecté dans la liste." }, { status: 400 });
  }

  // ── 6. Match DB ─────────────────────────────────────────────────────────
  const svc = serviceClient();
  const { data: matchData, error: matchError } = await svc.rpc("cosme_check_match_inci_batch", {
    p_tokens: tokens.map((t) => t.normalized),
  });
  if (matchError) {
    return jsonResponse(
      { error: "Erreur lors de l'analyse des ingrédients. Réessaye dans un instant." },
      { status: 500 },
    );
  }
  let rows = (matchData ?? []) as MatchRow[];

  // Correction typo IA (suggestions 0.55..0.90) : trigram → LLM → batch fetch.
  const suggestionRows = rows.filter((r) => r.match_kind === "suggestion");
  if (suggestionRows.length > 0) {
    type CandidateRow = { inci_id: number; name: string; primary_function: string | null; similarity: number };

    const candidateResults = await Promise.all(
      suggestionRows.map(async (row) => {
        const { data } = await svc.rpc("cosme_check_top_trigram_candidates", {
          p_token: tokens[row.position_idx]?.normalized ?? row.input_token,
          p_limit: 5,
        });
        return { row, candidates: (data ?? []) as CandidateRow[] };
      }),
    );

    const decisions = await Promise.all(
      candidateResults
        .filter(({ candidates }) => candidates.length > 0)
        .map(async ({ row, candidates }) => {
          const decision = await correctTypo(
            tokens[row.position_idx]?.normalized ?? row.input_token,
            candidates,
            user.id,
          );
          return { row, decision };
        }),
    );

    const winners = decisions.filter(
      ({ decision }) => decision.matchedInciId !== null && decision.confidence >= 0.85,
    );
    if (winners.length > 0) {
      const winnerIds = winners.map(({ decision }) => decision.matchedInciId as number);
      const { data: ingRows } = await svc
        .schema("cosme_check")
        .from("ingredients")
        .select("inci_id, slug, name, color_rating, cas_number, translations, functions, tags")
        .in("inci_id", winnerIds);

      type IngRow = {
        inci_id: number;
        slug: string;
        name: string;
        color_rating: ColorRating | null;
        cas_number: string | null;
        translations: Record<string, string> | null;
        functions: { name?: string }[] | null;
        tags: string[] | null;
      };
      const ingById = new Map(((ingRows ?? []) as IngRow[]).map((ing) => [ing.inci_id, ing]));

      for (const { row, decision } of winners) {
        const ing = ingById.get(decision.matchedInciId as number);
        if (!ing) continue;
        const idx = rows.findIndex((r) => r.position_idx === row.position_idx);
        if (idx >= 0) {
          rows[idx] = {
            input_token: row.input_token,
            position_idx: row.position_idx,
            inci_id: ing.inci_id,
            slug: ing.slug,
            name: ing.name,
            color_rating: ing.color_rating,
            cas_number: ing.cas_number,
            translation_fr: ing.translations?.fr ?? "",
            primary_function: ing.functions?.[0]?.name ?? "",
            all_functions: ing.functions?.map((f) => f.name ?? "").filter(Boolean) ?? null,
            tags: ing.tags,
            match_kind: "fuzzy_high",
            confidence: decision.confidence,
          };
        }
      }
    }
  }

  // ── Assemblage déterministe (PARTAGÉ avec le backfill product_analyses) ──
  // Toute la logique enrichissement → dédup → comptes → observations → seuils →
  // allergènes UE → spectre → items → score propriétaire vit dans ./core.ts
  // (extraction verbatim, 14 juil 2026) pour que le script de repeuplement
  // produise EXACTEMENT les mêmes result_json que le live.
  const core = buildAnalysisCore({ tokens, rows });
  const { enriched, counts, matched, observations, thresholdFor } = core;

  let score = core.score;
  let scoreLabelText = core.scoreLabelText;
  let scoreTone = core.scoreTone;

  // SOURCE DE VÉRITÉ : le catalogue. Si l'EAN est catalogué, on LIT son score
  // propriétaire ET sa catégorie curée → pastille + catégorie identiques partout
  // (recherche, catalogue, analyse). On ne recalcule pas, on ne re-catégorise pas
  // et on n'écrit jamais dans le catalogue au runtime. (catalogInfo chargé en
  // amont — un seul fetch par requête.)
  const catalogScore = catalogInfo?.score ?? null;
  const catalogCategorySlug = catalogInfo?.category ?? null;
  if (catalogScore != null) {
    // Réconciliation : on garde le score catalogue SAUF s'il tombe dans une
    // bande de qualité différente des couleurs live affichées (score déjà dans
    // `score` = core.score) → dans ce cas on sert le live (note = couleurs vues).
    score = reconcileScore(catalogScore, score, matched, core.countsPayload.total);
    const lab = scoreLabel(score);
    scoreLabelText = lab.label;
    scoreTone = lab.tone;
  }

  // Catégorisation : UNIQUEMENT pour un produit hors catalogue (ou catalogué sans
  // catégorie). Un produit déjà catalogué garde SA catégorie (source de vérité) :
  // on ne relance PAS le classifieur LLM. Cf. consigne « scan = lecture seule ».
  const needsCategory = !catalogCategorySlug;
  const categoryTop5Names = core.categoryTop5Names;
  const categoryPromise: Promise<ProductCategory> =
    needsCategory && categoryTop5Names.length > 0
      ? categorizeProduct(categoryTop5Names, user.id).catch(() => "autre" as ProductCategory)
      : Promise.resolve("autre" as ProductCategory);
  const precisePromise: Promise<string | null> = needsCategory
    ? classifyPreciseCategory(
        body.productLabel ?? null,
        body.brand ?? null,
        categoryTop5Names,
        user.id,
      ).catch(() => null)
    : Promise.resolve(null);

  // Synthèse LLM optionnelle (GPT-4o-mini primaire, Mistral fallback, cachée).
  // PERSONNALISÉE : le profil peau de l'utilisateur (s'il existe) est injecté
  // dans le system prompt et entre dans la cache key, donc deux utilisateurs
  // avec des profils différents obtiennent des synthèses distinctes sur la même
  // liste INCI. Mirror EXACT de app/api/analyser/route.ts.
  let synthesis: string | null = null;
  if (body.withSynthesis !== false) {
    const [profileBlock, restrictionsCtx] = await Promise.all([
      loadProfileForPrompt(sbAuth, user.id),
      loadRestrictionsContext(sbAuth, user.id),
    ]);

    // Pré-calcule les matchs de restriction par ingrédient pour que le LLM
    // n'ait pas à recouper manuellement le bloc restrictions.
    const checkItems = enriched.map((r) => ({
      position: r.position_idx + 1,
      input: r.input_raw,
      slug: r.slug,
      name: r.effective_name,
      tags: r.effective_tags ?? null,
    }));
    const restrictionMatches = checkRestrictions(
      checkItems,
      restrictionsCtx.restrictions,
      restrictionsCtx.families,
    );
    const reasonByPosition = new Map<number, string>();
    for (const m of restrictionMatches) {
      if (!reasonByPosition.has(m.position)) {
        reasonByPosition.set(m.position, m.label);
      }
    }

    synthesis = await generateSynthesis({
      enriched: enriched.map((r) => ({
        input_raw: r.input_raw,
        name: r.effective_name,
        color_rating: r.effective_color,
        primary_function: r.primary_function,
        tags: r.effective_tags,
        position_idx: r.position_idx,
        threshold_label: thresholdFor(r.position_idx).label,
        restriction_reason: reasonByPosition.get(r.position_idx + 1) ?? null,
      })),
      counts,
      score,
      scoreLabel: scoreLabelText,
      observations,
      productLabel: body.productLabel?.slice(0, 200) ?? null,
      userId: user.id,
      profileBlock,
      restrictionsBlock: restrictionsCtx.block,
    });
  }

  // Catégorie servie : le SLUG catalogue (source de vérité) s'il existe. Sinon
  // (produit hors catalogue) catégorie PROVISOIRE déduite (course 1.5 s LLM →
  // fallback keyword sur productType) — affichée à l'écran, jamais écrite au catalogue.
  const llmCategory: ProductCategory | null = catalogCategorySlug
    ? null
    : await Promise.race([
        categoryPromise.then((c) => (c && c !== "autre" ? c : null)),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
      ]);
  const resolvedCategory: string | null =
    catalogCategorySlug ?? llmCategory ?? normalizeProductTypeToCategory(body.productType) ?? null;

  const responsePayload = {
    counts: core.countsPayload,
    score,
    scoreLabel: scoreLabelText,
    scoreTone: scoreTone as ScoreTone,
    items: core.items,
    observations,
    aliasesUsed: core.aliasesUsed,
    suggestions: core.suggestions,
    spectrum: core.spectrum,
    euFragranceAllergens: core.euFragranceAllergens,
    synthesis,
    productType: body.productType?.slice(0, 120) ?? null,
    category: resolvedCategory,
  };

  // ── 7. Persistance ────────────────────────────────────────────────────────
  let savedAnalysisId: string | null = null;
  let addedToRoutine = false;
  try {
    const autoName = body.productLabel?.slice(0, 200)
      ?? `Analyse du ${new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}`;
    // Upsert dédupliqué : ré-analyser le même produit met à jour la ligne
    // existante (un produit = une seule entrée d'historique).
    const { data: upsertedId, error: insertError } = await sbAuth.rpc(
      "cosme_check_upsert_analysis",
      {
        p_name: autoName,
        p_product_label: body.productLabel?.slice(0, 200) ?? null,
        p_brand: body.brand?.slice(0, 120) ?? null,
        p_product_type: body.productType?.slice(0, 120) ?? null,
        p_category: resolvedCategory,
        p_input_text: text,
        p_result_json: responsePayload,
        p_score: Number(score.toFixed(2)),
        p_ean: body.productEan?.slice(0, 32) ?? null,
      },
    );
    const insertedId = (upsertedId as string) ?? null;
    if (!insertError && insertedId) {
      savedAnalysisId = insertedId;
      if (body.addToRoutine === true) {
        const { error: routineErr } = await sbAuth
          .schema("cosme_check")
          .from("routine_items")
          .upsert(
            { user_id: user.id, analysis_id: insertedId, frequency: "daily" },
            { onConflict: "user_id,analysis_id" },
          );
        if (!routineErr) addedToRoutine = true;
      }
      // Patch catégorie en arrière-plan UNIQUEMENT hors catalogue (le LLM peut
      // répondre après la course 1.5 s). Un produit catalogué garde sa catégorie
      // catalogue : aucun patch LLM, aucun écrasement.
      if (needsCategory) {
        const categorizeId = insertedId;
        void categoryPromise
          .then(async (cat) => {
            if (!cat || cat === resolvedCategory) return;
            await sbAuth
              .schema("cosme_check")
              .from("analyses")
              .update({ category: cat })
              .eq("id", categorizeId);
          })
          .catch(() => undefined);
        void precisePromise
          .then(async (slug) => {
            if (!slug) return;
            await sbAuth
              .schema("cosme_check")
              .from("analyses")
              .update({ category_precise: slug })
              .eq("id", categorizeId);
          })
          .catch(() => undefined);
      }
    }
  } catch { /* l'échec d'historique ne bloque jamais la réponse */ }

  // Cache EAN product_analyses (service-role, non-bloquant).
  if (productEan) {
    void (async () => {
      const { upsertProductAnalysis } = await import("./catalog.ts");
      await upsertProductAnalysis({
        ean: productEan,
        resultJson: responsePayload,
        score: Number(score.toFixed(4)),
        scoreLabel: scoreLabelText,
        scoreTone,
        algoVersion: "v1.2",
      });
    })();

    // Écriture catalogue SUPPRIMÉE : le scan est en LECTURE SEULE. Le catalogue
    // (catégorie + score propriétaire) est la source de vérité, jamais alimenté
    // ni écrasé au runtime. Un produit hors catalogue part en curation (ci-dessous).
  }

  // Action 2 : produit issu d'un OCR (pas d'EAN) mais marque + libellé connus →
  // on alimente product_inci_cache pour que les recherches par nom futures
  // touchent le cache au lieu de relancer toute la cascade web. Mirror web.
  if (!productEan && body.brand && body.productLabel && body.text && body.text.length > 30) {
    const ocrBrand = body.brand;
    const ocrLabel = body.productLabel;
    const ocrText = body.text;
    void (async () => {
      const { setProductCache, normalizeQuery } = await import("./catalog.ts");
      const queryNorm = normalizeQuery(`${ocrBrand} ${ocrLabel}`);
      await setProductCache({
        queryNorm,
        brand: ocrBrand,
        productName: ocrLabel,
        ingredientsText: ocrText,
        source: "photo_ocr",
        sourceUrl: null,
        confidence: 0.90,
      });
    })();
  }

  // Produit HORS CATALOGUE (pas d'EAN scanné, marque + nom connus) → file de
  // curation `web_products` UNIQUEMENT. On ne résout plus d'EAN via Open Beauty
  // Facts et on n'écrit JAMAIS dans le catalogue au runtime (c'était la source de
  // la pollution : doublons EAN OBF avec catégorie LLM + score recalculé).
  // L'analyse affichée reste PROVISOIRE ; c'est la curation admin qui fera entrer
  // le produit au catalogue avec sa vraie catégorie + son score propriétaire.
  if (!productEan && body.brand && body.productLabel) {
    const eanBrand = body.brand;
    const eanLabel = body.productLabel;
    const eanInci = body.text ?? null;
    const provisionalCat = resolvedCategory;
    void (async () => {
      try {
        await serviceClient().rpc("cosme_check_log_web_product", {
          p_dedupe_key: dedupeKey(eanBrand, eanLabel),
          p_brand: eanBrand,
          p_name: eanLabel,
          p_category: provisionalCat,
          p_ingredients_text: eanInci,
          p_description: null,
          p_image_url: null,
          p_source_url: null,
        });
      } catch { /* silent */ }
    })();
  }

  const finalBody = { ...responsePayload, analysisId: savedAnalysisId, addedToRoutine };
  await idempotencyStore(idemKey, finalBody);
  return jsonResponse(finalBody);
});
