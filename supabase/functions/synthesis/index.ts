/**
 * Edge Function `synthesis` — port de
 * `CosmetWiki/app/api/synthesis/route.ts` + `lib/ai/synthesis.ts` (variante
 * PERSONNALISÉE).
 *
 * Génère (ou renvoie la synthèse déjà générée) pour une analyse sauvegardée.
 * Séparé de `analyser` pour que la réponse du scan initial reste rapide ; le
 * gros appel LLM est différé jusqu'à ce que l'utilisateur demande l'analyse
 * complète ("Voir l'analyse complète").
 *
 * Pipeline (ordre IDENTIQUE au web) :
 *   1. Auth Bearer SEULE (pas d'apiGate côté web : ni rate-limit IP ni crédit ;
 *      message 401 exact "Non authentifié."). RLS appliquée via client token.
 *   2. Charge la ligne analyses (client lié au user → RLS borne au propriétaire ;
 *      on vérifie aussi user_id explicitement pour renvoyer 403 vs 404).
 *   3. Court-circuit si result_json.synthesis existe déjà (passe par
 *      stripAbsencesParagraph, AUCUN write).
 *   4. Charge profil peau + restrictions (loadUserContext), recalcule les
 *      matches de restriction (checkRestrictions) pour annoter chaque item d'un
 *      restriction_reason, enrichit, remappe les counts (clés capitalisées),
 *      appelle generateSynthesis personnalisée, strip, persiste best-effort,
 *      renvoie { synthesis }.
 *
 * Entrée : { analysisId: string }
 * Sortie : { synthesis: string | null }  (ou { error } + status sur échec)
 * Crédit : 1 débité À LA GÉNÉRATION (gratuit en relecture, synthèse persistée).
 */
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { getBearerToken, unauthorizedResponse, userClient } from "../_shared/auth.ts";
import { stripAbsencesParagraph } from "../_shared/sanitize.ts";
import {
  type CheckableItem,
  checkRestrictions,
  type ColorRating,
  generateSynthesis,
  loadUserContext,
  SYNTH_PROMPT_VERSION,
} from "./lib.ts";

type Body = { analysisId?: string };

/** Forme d'un item tel que persisté dans analyses.result_json.items (camelCase). */
type StoredItem = {
  position: number;
  input: string;
  slug: string | null;
  name: string | null;
  colorRating: ColorRating | null;
  primaryFunction: string | null;
  tags: string[] | null;
  thresholdLabel: string | null;
};

type StoredResultJson = {
  items?: StoredItem[];
  counts?: {
    vert?: number;
    jaune?: number;
    orange?: number;
    rouge?: number;
  };
  scoreLabel?: string;
  observations?: { label: string; status: "present" | "absent" | "info" | "warn"; count: number }[];
  synthesis?: string | null;
  /** Clé des restrictions au moment de la génération de la synthèse (cf. restrictionsKey).
   *  Si ≠ restrictions actuelles → synthèse périmée → régénération. */
  synthesisRestrictionsKey?: string | null;
};

/**
 * Clé canonique des restrictions. DOIT être identique au client
 * (lib/analysis/restrictionsKey.ts) sinon la synthèse se régénère à chaque ouverture.
 */
function restrictionsKey(
  r: { families: string[]; ingredients: { slug: string; name: string }[] } | null | undefined,
): string {
  const fams = (r?.families ?? [])
    .map((f) => (f ?? "").trim().toLowerCase())
    .filter((f) => f.length > 0)
    .sort();
  const ings = (r?.ingredients ?? [])
    .map((i) => ((i?.slug ?? i?.name) ?? "").trim().toLowerCase())
    .filter((s) => s.length > 0)
    .sort();
  return `${fams.join(",")}|${ings.join(",")}`;
}

Deno.serve(async (req: Request): Promise<Response> => {
  const pre = handleOptions(req);
  if (pre) return pre;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Méthode non autorisée." }, { status: 405 });
  }

  // ── 1. Parse body ────────────────────────────────────────────────────────
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return jsonResponse({ error: "Requête invalide." }, { status: 400 });
  }

  const analysisId = (body.analysisId ?? "").trim();
  if (!analysisId) {
    return jsonResponse({ error: "analysisId manquant." }, { status: 400 });
  }

  // ── 2. Auth Bearer SEULE (parité web). ─────────────────────────────────────
  // La route web `app/api/synthesis/route.ts` n'utilise PAS apiGate : pas de
  // rate-limit IP, pas de débit de crédit (même à coût 0). Juste getUser() avec
  // le message exact "Non authentifié.". On reproduit ça à l'identique : auth
  // Bearer brute via un client lié au token (RLS = ce user), AUCUN gate.
  const token = getBearerToken(req);
  const supabase = userClient(token);
  if (!token) {
    return unauthorizedResponse("Non authentifié.");
  }
  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  const user = userData?.user;
  if (userErr || !user) {
    return unauthorizedResponse("Non authentifié.");
  }

  // ── 3. Charge la ligne (RLS via client user). ─────────────────────────────
  const { data: row, error: rowError } = await supabase
    .schema("cosme_check")
    .from("analyses")
    .select("id, user_id, product_label, score, result_json")
    .eq("id", analysisId)
    .single();

  if (rowError || !row) {
    return jsonResponse({ error: "Analyse introuvable." }, { status: 404 });
  }
  if (row.user_id !== user.id) {
    return jsonResponse({ error: "Accès refusé." }, { status: 403 });
  }

  const resultJson = (row.result_json ?? null) as StoredResultJson | null;
  if (!resultJson || !Array.isArray(resultJson.items)) {
    return jsonResponse({ error: "Analyse invalide." }, { status: 400 });
  }

  // ── 3b. Restrictions courantes + leur clé (best-effort, ne throw jamais). ──
  const { profileBlock, restrictions: restrictionsCtx } = await loadUserContext(
    supabase,
    user.id,
  );
  // La version du prompt entre dans la clé : bumper SYNTH_PROMPT_VERSION
  // régénère les synthèses déjà persistées (sinon elles resteraient sur l'ancien
  // format au prochain "Voir l'analyse complète").
  const synthKey = `${restrictionsKey(restrictionsCtx.restrictions)}|v${SYNTH_PROMPT_VERSION}`;

  // ── 3c. Court-circuit : on réutilise la synthèse en cache UNIQUEMENT si elle a
  // été générée avec les MÊMES restrictions qu'aujourd'hui. Sinon elle est périmée
  // (ex. « X que tu as choisi d'éviter » alors que la restriction a été retirée)
  // → on régénère pour rester cohérent avec le badge live.
  if (resultJson.synthesis && resultJson.synthesisRestrictionsKey === synthKey) {
    return jsonResponse({ synthesis: stripAbsencesParagraph(resultJson.synthesis) });
  }

  // ── 3c-bis. Crédit : 1 crédit débité À LA GÉNÉRATION uniquement. ───────────
  // La synthèse est persistée dans result_json → revoir une analyse déjà
  // synthétisée repasse par le court-circuit ci-dessus (gratuit). On ne débite
  // donc QUE la première génération (ou une régénération après changement de
  // restrictions). Épuisé → 429 + payload `credits` (le client ouvre la modale).
  const { data: creditData } = await supabase.rpc("cosme_check_consume_credit", {
    p_feature: "synthesis",
  });
  const consume = (creditData ?? { ok: false }) as {
    ok: boolean
    used?: number
    limit?: number
    remaining?: number
  };
  if (!consume.ok) {
    return jsonResponse(
      {
        error: "Tu as utilisé tous tes crédits du jour. Reviens demain.",
        credits: { used: consume.used ?? 0, limit: consume.limit ?? 100, remaining: 0 },
      },
      { status: 429 },
    );
  }

  try {
    const items = resultJson.items as StoredItem[];

    // Re-match les restrictions exactement comme analyser, pour attacher un
    // restriction_reason par item et laisser le LLM le signaler inline.
    const checkItems: CheckableItem[] = items.map((it) => ({
      position: it.position,
      input: it.input,
      slug: it.slug,
      name: it.name,
      tags: it.tags ?? null,
    }));
    const matches = checkRestrictions(
      checkItems,
      restrictionsCtx.restrictions,
      restrictionsCtx.families,
    );
    const reasonByPosition = new Map<number, string>();
    for (const m of matches) {
      if (!reasonByPosition.has(m.position)) reasonByPosition.set(m.position, m.label);
    }

    const enriched = items.map((it) => ({
      input_raw: it.input,
      name: it.name,
      color_rating: it.colorRating,
      primary_function: it.primaryFunction,
      tags: it.tags,
      position_idx: it.position - 1,
      threshold_label: it.thresholdLabel,
      restriction_reason: reasonByPosition.get(it.position) ?? null,
    }));

    // generateSynthesis attend des counts en clés capitalisées. Le result_json
    // stocke des clés minuscules pour l'UI ; sans remap la synthèse lit 0
    // partout et écrit "Sur les 0 ingrédients…".
    const countsForLlm: Record<string, number> = {
      Vert: resultJson.counts?.vert ?? 0,
      Jaune: resultJson.counts?.jaune ?? 0,
      Orange: resultJson.counts?.orange ?? 0,
      Rouge: resultJson.counts?.rouge ?? 0,
    };

    const rawSynthesis = await generateSynthesis({
      enriched,
      counts: countsForLlm,
      score: Number(row.score ?? 0),
      scoreLabel: resultJson.scoreLabel ?? "",
      observations: resultJson.observations ?? [],
      productLabel: row.product_label ?? null,
      userId: user.id,
      profileBlock,
      restrictionsBlock: restrictionsCtx.block,
    });

    // Belt + braces : strip l'éventuelle puce d'absences avant de persister.
    const synthesis = rawSynthesis ? stripAbsencesParagraph(rawSynthesis) : null;

    // Persiste best-effort dans la ligne (prochaine visite instantanée).
    if (synthesis) {
      const updatedJson = { ...resultJson, synthesis, synthesisRestrictionsKey: synthKey };
      await supabase
        .schema("cosme_check")
        .from("analyses")
        .update({ result_json: updatedJson })
        .eq("id", analysisId);
      // En cas d'échec d'update on renvoie quand même la synthèse.
    }

    return jsonResponse({ synthesis });
  } catch {
    return jsonResponse(
      { error: "Impossible de générer la synthèse pour le moment." },
      { status: 500 },
    );
  }
});
