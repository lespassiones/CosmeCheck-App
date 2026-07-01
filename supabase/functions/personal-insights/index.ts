/**
 * Edge Function `personal-insights` — 3 encarts PERSONNALISÉS (objectifs / peau /
 * à surveiller) pour une analyse sauvegardée, selon le profil de l'utilisateur.
 *
 * Pipeline :
 *   1. Auth Bearer (RLS via client token). 403/404 selon propriété.
 *   2. Charge le profil + restrictions (loadUserContext) → signature de profil.
 *   3. COURT-CIRCUIT GRATUIT : si result_json.personalBlocks existe ET que sa clé
 *      == signature de profil courante → renvoie sans débiter (relecture).
 *   4. CRÉDIT D'ABORD : consume_credit('personal_insights'). Épuisé → 429 +
 *      payload `credits` (AUCUN appel IA, aucun coût) → le client verrouille.
 *   5. Génère les 3 blocs (1 appel LLM JSON), persiste dans result_json, renvoie.
 *
 * Entrée : { analysisId: string }
 * Sortie : { blocks: { goals, skin, watch } }  (ou { error } + status)
 * Crédit : 1 débité À LA GÉNÉRATION (gratuit en relecture, persisté).
 */
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { getBearerToken, unauthorizedResponse, userClient } from "../_shared/auth.ts";
import {
  type CheckableItem,
  checkRestrictions,
  type ColorRating,
  loadUserContext,
} from "../synthesis/lib.ts";
import {
  generatePersonalBlocks,
  type PersonalBlocks,
  profileSignature,
} from "./lib.ts";

type Body = { analysisId?: string };

type StoredItem = {
  position: number;
  input: string;
  slug: string | null;
  name: string | null;
  colorRating: ColorRating | null;
  primaryFunction: string | null;
  tags: string[] | null;
};

type StoredResultJson = {
  items?: StoredItem[];
  counts?: { vert?: number; jaune?: number; orange?: number; rouge?: number };
  scoreLabel?: string;
  category?: string | null;
  catalogCategory?: string | null;
  productType?: string | null;
  personalBlocks?: PersonalBlocks | null;
  personalBlocksKey?: string | null;
};

Deno.serve(async (req: Request): Promise<Response> => {
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
  const analysisId = (body.analysisId ?? "").trim();
  if (!analysisId) return jsonResponse({ error: "analysisId manquant." }, { status: 400 });

  // ── Auth Bearer ───────────────────────────────────────────────────────────
  const token = getBearerToken(req);
  const supabase = userClient(token);
  if (!token) return unauthorizedResponse("Non authentifié.");
  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  const user = userData?.user;
  if (userErr || !user) return unauthorizedResponse("Non authentifié.");

  // ── Charge la ligne (RLS) ───────────────────────────────────────────────────
  const { data: row, error: rowError } = await supabase
    .schema("cosme_check")
    .from("analyses")
    .select("id, user_id, product_label, score, result_json")
    .eq("id", analysisId)
    .single();
  if (rowError || !row) return jsonResponse({ error: "Analyse introuvable." }, { status: 404 });
  if (row.user_id !== user.id) return jsonResponse({ error: "Accès refusé." }, { status: 403 });

  const resultJson = (row.result_json ?? null) as StoredResultJson | null;
  if (!resultJson || !Array.isArray(resultJson.items)) {
    return jsonResponse({ error: "Analyse invalide." }, { status: 400 });
  }

  // ── Profil + restrictions → signature ───────────────────────────────────────
  const { profileBlock, restrictions } = await loadUserContext(supabase, user.id);
  const sig = await profileSignature(profileBlock, restrictions.block);

  // ── Court-circuit gratuit (déjà généré pour ce profil ET version courante) ──
  if (resultJson.personalBlocks && resultJson.personalBlocksKey === sig) {
    return jsonResponse({ blocks: resultJson.personalBlocks });
  }

  // ── CRÉDIT : seule la PREMIÈRE génération coûte 1 crédit ────────────────────
  // Si des blocs existent déjà mais que la clé est PÉRIMÉE (nouvelle version de
  // prompt, ou profil modifié), c'est une RÉGÉNÉRATION d'un contenu DÉJÀ PAYÉ →
  // on ne re-débite JAMAIS (sinon une amélioration de notre part coûterait au
  // user, et un user à 0 crédit resterait bloqué sur d'anciens blocs).
  const alreadyHasBlocks = Boolean(resultJson.personalBlocks);
  if (!alreadyHasBlocks) {
    const { data: creditData } = await supabase.rpc("cosme_check_consume_credit", {
      p_feature: "personal_insights",
    });
    const consume = (creditData ?? { ok: false }) as {
      ok: boolean;
      used?: number;
      limit?: number;
    };
    if (!consume.ok) {
      return jsonResponse(
        {
          error: "Crédits épuisés.",
          credits: { used: consume.used ?? 0, limit: consume.limit ?? 100, remaining: 0 },
        },
        { status: 429 },
      );
    }
  }

  // ── Prépare les données + matching restrictions ─────────────────────────────
  const items = resultJson.items as StoredItem[];
  const checkItems: CheckableItem[] = items.map((it) => ({
    position: it.position,
    input: it.input,
    slug: it.slug,
    name: it.name,
    tags: it.tags ?? null,
  }));
  const matches = checkRestrictions(checkItems, restrictions.restrictions, restrictions.families);
  const reasonByPosition = new Map<number, string>();
  for (const m of matches) if (!reasonByPosition.has(m.position)) reasonByPosition.set(m.position, m.label);

  const enriched = items.map((it) => ({
    input_raw: it.input,
    name: it.name,
    color_rating: it.colorRating,
    primary_function: it.primaryFunction,
    tags: it.tags,
    restriction_reason: reasonByPosition.get(it.position) ?? null,
  }));

  const blocks = await generatePersonalBlocks({
    enriched,
    counts: {
      Vert: resultJson.counts?.vert ?? 0,
      Jaune: resultJson.counts?.jaune ?? 0,
      Orange: resultJson.counts?.orange ?? 0,
      Rouge: resultJson.counts?.rouge ?? 0,
    },
    score: Number(row.score ?? 0),
    scoreLabel: resultJson.scoreLabel ?? "",
    productLabel: row.product_label ?? null,
    category: resultJson.productType ?? resultJson.catalogCategory ?? resultJson.category ?? null,
    userId: user.id,
    profileBlock,
    restrictionsBlock: restrictions.block,
    restrictionMatches: matches,
  });

  if (!blocks) {
    return jsonResponse(
      { error: "Génération indisponible pour le moment." },
      { status: 503 },
    );
  }

  // ── Persiste (relecture instantanée + gratuite) ─────────────────────────────
  const updatedJson = { ...resultJson, personalBlocks: blocks, personalBlocksKey: sig };
  await supabase
    .schema("cosme_check")
    .from("analyses")
    .update({ result_json: updatedJson })
    .eq("id", analysisId);

  return jsonResponse({ blocks });
});
