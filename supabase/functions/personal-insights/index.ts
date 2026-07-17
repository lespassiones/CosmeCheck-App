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
  loadIngredientFamilies,
  loadUserContext,
} from "../synthesis/lib.ts";
import {
  type Compatibility,
  generatePersonalBlocks,
  type PersonalBlocks,
  profileSignature,
} from "./lib.ts";
import { detectForcedAgainst, relevanceVerdict } from "./relevance.ts";

type Body = { analysisId?: string; compat?: boolean };

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
  scoreTone?: string | null;
  category?: string | null;
  catalogCategory?: string | null;
  productType?: string | null;
  personalBlocks?: PersonalBlocks | null;
  personalBlocksKey?: string | null;
  compatibility?: Compatibility | null;
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
    .select("id, user_id, product_label, product_type, category, score, result_json")
    .eq("id", analysisId)
    .single();
  if (rowError || !row) return jsonResponse({ error: "Analyse introuvable." }, { status: 404 });
  if (row.user_id !== user.id) return jsonResponse({ error: "Accès refusé." }, { status: 403 });

  const resultJson = (row.result_json ?? null) as StoredResultJson | null;
  if (!resultJson || !Array.isArray(resultJson.items)) {
    return jsonResponse({ error: "Analyse invalide." }, { status: 400 });
  }

  // ── Profil + restrictions → signature ───────────────────────────────────────
  const { profileBlock: rawProfileBlock, skin, restrictions } = await loadUserContext(supabase, user.id);

  // Récap IA « sensibilités probables » (worker profile-restriction-inference,
  // back-end invisible) : injecté dans le BLOC PROFIL comme INDICES pour les
  // contre-indications (-5). JAMAIS un malus restriction (-8) : seules les
  // restrictions COCHÉES pénalisent. Inclus AVANT la signature → un récap mis à
  // jour régénère les blocs gratuitement (self-heal), zéro appel supplémentaire
  // au chemin d'analyse (une simple lecture d'une ligne indexée par PK).
  let profileBlock = rawProfileBlock;
  // Slugs de FAMILLE des sensibilités déduites (worker d'inférence). Servent au
  // SCORING : détectés dans le produit → -8 (comme une restriction cochée),
  // dédoublonnés vs les cochées côté enforceCompatibility.
  const inferredFamilySlugs: string[] = [];
  if (rawProfileBlock) {
    const { data: inferredRow } = await supabase
      .schema("cosme_check")
      .from("profile_restriction_inference")
      .select("items")
      .eq("user_id", user.id)
      .maybeSingle();
    const inferredItems = Array.isArray(inferredRow?.items)
      ? (inferredRow.items as { label?: string; reason?: string; slug?: string | null }[])
          .filter((i) => typeof i?.label === "string" && i.label.trim())
      : [];
    if (inferredItems.length > 0) {
      const line = inferredItems
        .slice(0, 8)
        .map((i) => (i.reason ? `${i.label} (${i.reason})` : (i.label as string)))
        .join(" ; ");
      profileBlock = `${rawProfileBlock}\n- Sensibilités probables (déduites automatiquement du profil, NON confirmées par l'utilisateur) : ${line}`;
      for (const it of inferredItems) {
        const s = (it.slug ?? "").trim();
        if (s && !inferredFamilySlugs.includes(s)) inferredFamilySlugs.push(s);
      }
    }
  }
  const sig = await profileSignature(profileBlock, restrictions.block);
  // `||` (pas `??`) : une chaîne VIDE doit retomber sur le champ suivant.
  // FALLBACK COLONNES DB (fix juil 2026) : les analyses anciennes n'ont pas de
  // catégorie dans result_json → sans ce repli, un hydratant corps passait en
  // « produit du quotidien » (product_only) et perdait ses bonus profil.
  const category = resultJson.productType || resultJson.catalogCategory || resultJson.category
    || (row.product_type as string | null) || (row.category as string | null) || null;

  // ── Court-circuit gratuit (déjà généré pour ce profil ET version courante) ──
  if (resultJson.personalBlocks && resultJson.personalBlocksKey === sig) {
    return jsonResponse({
      blocks: resultJson.personalBlocks,
      compatibility: resultJson.compatibility ?? null,
    });
  }

  // ── Pré-check pertinence AVANT tout crédit / appel IA ───────────────────────
  // Produit rattaché à un axe du profil (peau/cheveux) mais axe VIDE → on NE
  // débite PAS et on renvoie l'utilisateur compléter EXACTEMENT la bonne section.
  // Produit hors profil (dentifrice, déo, accessoire…) → jamais bloqué (le score
  // se basera sur la qualité de la formule, MODE product_only).
  // Le blocage « profil incomplet » n'est activé QUE si le client le demande
  // (compat:true). RÉTRO-COMPATIBILITÉ : les anciens clients (sans le flag)
  // reçoivent toujours leurs 3 blocs comme avant + le score (qu'ils ignorent) ;
  // ils ne sont jamais bloqués → déploiement edge sûr avant rebuild des apps.
  const wantCompat = body.compat === true;
  const verdict = relevanceVerdict(category, skin);
  if (wantCompat && verdict.kind === "profile_incomplete") {
    return jsonResponse({ profileIncomplete: true, missingSection: verdict.missingSection });
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
  // Détection des familles DÉDUITES du profil présentes dans le produit (mêmes
  // -8 que les restrictions cochées). loadUserContext ne charge le catalogue de
  // familles QUE si l'utilisateur a des restrictions cochées → on le charge ici
  // si besoin (cas « aucune restriction cochée mais sensibilités déduites »).
  let familyCatalogue = restrictions.families;
  if (inferredFamilySlugs.length > 0 && familyCatalogue.length === 0) {
    familyCatalogue = await loadIngredientFamilies(supabase);
  }
  const inferredMatches = inferredFamilySlugs.length > 0
    ? checkRestrictions(checkItems, { families: inferredFamilySlugs, ingredients: [] }, familyCatalogue)
    : [];
  const reasonByPosition = new Map<number, string>();
  for (const m of matches) if (!reasonByPosition.has(m.position)) reasonByPosition.set(m.position, m.label);

  const enriched = items.map((it) => ({
    input_raw: it.input,
    name: it.name,
    color_rating: it.colorRating,
    primary_function: it.primaryFunction,
    tags: it.tags,
    position_idx: it.position - 1,
    restriction_reason: reasonByPosition.get(it.position) ?? null,
  }));

  const result = await generatePersonalBlocks({
    enriched,
    counts: {
      Vert: resultJson.counts?.vert ?? 0,
      Jaune: resultJson.counts?.jaune ?? 0,
      Orange: resultJson.counts?.orange ?? 0,
      Rouge: resultJson.counts?.rouge ?? 0,
    },
    score: Number(row.score ?? 0),
    scoreLabel: resultJson.scoreLabel ?? "",
    scoreTone: resultJson.scoreTone ?? null,
    productLabel: row.product_label ?? null,
    category,
    userId: user.id,
    profileBlock,
    restrictionsBlock: restrictions.block,
    restrictionMatches: matches,
    inferredRestrictionMatches: inferredMatches,
    // product_only = produit HORS PROFIL (axe "none" : dentifrice, déo…) OU
    // profil/axe non renseigné (v29, demande user 16 juil 2026) : le score suit
    // la QUALITÉ de la formule, mais l'IA liste quand même les bons actifs
    // (utiles de manière globale) et les points à surveiller — affichés à
    // 0 point dans le détail du calcul. Seul verdict "personal" (axe peau/
    // cheveux rattaché ET renseigné) donne les bonus/malus qui bougent le score.
    productOnly: verdict.kind !== "personal",
    // Filets déterministes (le LLM les rate parfois) : alcool asséchant × peau
    // sèche/sensible, allergènes parfum, comédogènes, sulfates, allergie déclarée.
    // Uniquement en mode personal : ces filets croisent le profil PEAU/CHEVEUX,
    // hors sujet pour un produit hors profil (dentifrice × « ta peau sensible »).
    forcedAgainst: verdict.kind === "personal" ? detectForcedAgainst(items, skin) : [],
  });

  if (!result) {
    return jsonResponse(
      { error: "Génération indisponible pour le moment." },
      { status: 503 },
    );
  }
  const { blocks, compatibility } = result;

  // ── Persiste (relecture instantanée + gratuite) ─────────────────────────────
  const updatedJson = {
    ...resultJson,
    personalBlocks: blocks,
    personalBlocksKey: sig,
    compatibility,
  };
  await supabase
    .schema("cosme_check")
    .from("analyses")
    .update({ result_json: updatedJson })
    .eq("id", analysisId);

  return jsonResponse({ blocks, compatibility });
});
