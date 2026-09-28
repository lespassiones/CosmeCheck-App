/**
 * Edge Function `personal-insights` : 3 encarts PERSONNALISÉS (objectifs / peau /
 * à surveiller) pour une analyse sauvegardée, selon le profil de l'utilisateur.
 *
 * Pipeline :
 *   1. Auth Bearer (RLS via client token). 403/404 selon propriété.
 *   2. Résout le CONTEXTE PRODUIT (zone + rincé/sans rinçage, productContext.ts),
 *      puis charge le profil LIMITÉ à cette zone + restrictions : signature.
 *   3. COURT-CIRCUIT GRATUIT : si result_json.personalBlocks existe ET que sa clé
 *      == signature courante : renvoie sans débiter (relecture).
 *   4. CRÉDIT D'ABORD (première génération seulement) : consume_credit
 *      ('personal_insights'). Épuisé : 429 + payload `credits` (AUCUN appel IA,
 *      aucun coût), le client verrouille.
 *   5. Génère les 3 blocs (1 appel LLM JSON), persiste dans result_json, renvoie.
 *
 * Entrée : { analysisId: string }
 * Sortie : { blocks: { goals, skin, watch } }  (ou { error } + status)
 * Crédit : 1 débité À LA GÉNÉRATION (gratuit en relecture ET en régénération
 * d'un contenu déjà payé : nouvelle version de prompt, profil ou zone modifiés).
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
import { isCatalogSlug, pickCatalogSlug, resolveProductContext } from "./productContext.ts";
import { detectForcedAgainst, inferredSensitivityApplies, relevanceVerdictForContext } from "./relevance.ts";
import { buildZoneProfileBlock } from "./zoneProfile.ts";

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

type InferredItem = { label?: string; reason?: string; slug?: string | null };

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
    .select("id, user_id, product_label, product_type, category, category_precise, score, result_json")
    .eq("id", analysisId)
    .single();
  if (rowError || !row) return jsonResponse({ error: "Analyse introuvable." }, { status: 404 });
  if (row.user_id !== user.id) return jsonResponse({ error: "Accès refusé." }, { status: 403 });

  const resultJson = (row.result_json ?? null) as StoredResultJson | null;
  if (!resultJson || !Array.isArray(resultJson.items)) {
    return jsonResponse({ error: "Analyse invalide." }, { status: 400 });
  }
  const items = resultJson.items as StoredItem[];

  // ── Contexte produit : OÙ s'applique-t-il, et est-il rincé ? ────────────────
  // Bêta 28 sept 2026 (« crème cheveux analysée comme un soin visage ») : avant,
  // la catégorie était `productType || catalogCategory || …` (texte libre en
  // premier, une seule chaîne) et visage/corps étaient fusionnés. Désormais :
  // catalogue curé, puis nom, puis texte libre, puis catégorie LLM, puis INCI.
  // `||` (pas `??`) : une chaîne VIDE doit retomber sur le champ suivant.
  const storedCategories = [resultJson.category, row.category as string | null];
  const productType = resultJson.productType || (row.product_type as string | null) || null;
  const productContext = resolveProductContext({
    catalogCategory: resultJson.catalogCategory ?? null,
    categories: storedCategories,
    productType,
    categoryPrecise: (row.category_precise as string | null) ?? null,
    productName: (row.product_label as string | null) ?? null,
    items,
  });
  // Libellé de type montré au LLM : slug catalogue curé d'abord, puis texte libre,
  // puis la catégorie devinée par l'analyseur SEULEMENT si c'est elle qui a
  // tranché la zone (sinon « creme_corps » contredirait une zone « cheveux »).
  const catalogSlug = pickCatalogSlug({ catalogCategory: resultJson.catalogCategory, categories: storedCategories });
  const guessedCategory = storedCategories.find((c) => typeof c === "string" && c.trim() && !isCatalogSlug(c)) ?? null;
  const category = catalogSlug || productType
    || (productContext.source === "category" ? guessedCategory : null) || null;

  // ── Profil (LIMITÉ à la zone) + restrictions : signature ─────────────────────
  const { profileBlock: rawProfileBlock, skin, restrictions } = await loadUserContext(supabase, user.id);
  let profileBlock = buildZoneProfileBlock(skin, productContext);

  // Récap IA « sensibilités probables » (worker profile-restriction-inference,
  // back-end invisible) : injecté dans le BLOC PROFIL comme INDICES pour les
  // contre-indications, et détecté dans le produit : -8 (comme une restriction
  // cochée, dédoublonné vs les cochées côté enforceCompatibility). FILTRÉ PAR
  // ZONE : une sensibilité « peau acnéique » ne pénalise pas un shampooing.
  // Inclus AVANT la signature : un récap mis à jour régénère les blocs
  // gratuitement (self-heal), une simple lecture d'une ligne indexée par PK.
  const inferredFamilySlugs: string[] = [];
  if (rawProfileBlock) {
    const { data: inferredRow } = await supabase
      .schema("cosme_check")
      .from("profile_restriction_inference")
      .select("items")
      .eq("user_id", user.id)
      .maybeSingle();
    const inferredItems = Array.isArray(inferredRow?.items)
      ? (inferredRow.items as InferredItem[])
        .filter((i) => typeof i?.label === "string" && i.label.trim())
        .filter((i) => inferredSensitivityApplies(i, productContext))
      : [];
    if (inferredItems.length > 0) {
      const line = inferredItems
        .slice(0, 8)
        .map((i) => (i.reason ? `${i.label} (${i.reason})` : (i.label as string)))
        .join(" ; ");
      if (profileBlock) {
        profileBlock = `${profileBlock}\n- Sensibilités probables (déduites automatiquement du profil, NON confirmées par l'utilisateur) : ${line}`;
      }
      for (const it of inferredItems) {
        const s = (it.slug ?? "").trim();
        if (s && !inferredFamilySlugs.includes(s)) inferredFamilySlugs.push(s);
      }
    }
  }
  const sig = await profileSignature(profileBlock, restrictions.block, productContext);

  const wantCompat = body.compat === true;

  // ── Court-circuit gratuit (déjà généré pour ce profil, cette zone ET version) ─
  // SELF-HEAL (18 juil 2026) : si le client veut la compat mais que la ligne a
  // des blocs SANS compatibility (bug historique : l'upsert dédup au re-scan
  // préservait les blocs mais effaçait la compat, carte sans score pour
  // toujours), on NE court-circuite PAS : on retombe sur la régénération,
  // GRATUITE (alreadyHasBlocks ⇒ aucun débit), qui re-persiste blocs + compat.
  if (
    resultJson.personalBlocks && resultJson.personalBlocksKey === sig &&
    (!wantCompat || resultJson.compatibility)
  ) {
    return jsonResponse({
      blocks: resultJson.personalBlocks,
      compatibility: resultJson.compatibility ?? null,
    });
  }

  // ── Pré-check pertinence AVANT tout crédit / appel IA ───────────────────────
  // Produit rattaché à un axe du profil (peau/cheveux) mais axe VIDE : on NE
  // débite PAS et on renvoie l'utilisateur compléter EXACTEMENT la bonne section.
  // Produit hors profil (dentifrice, déo, accessoire…) ou dont la zone n'est
  // couverte par aucun élément du profil : jamais bloqué (MODE product_only).
  // Le blocage « profil incomplet » n'est activé QUE si le client le demande
  // (compat:true). RÉTRO-COMPATIBILITÉ : les anciens clients (sans le flag)
  // reçoivent toujours leurs 3 blocs comme avant + le score (qu'ils ignorent) ;
  // ils ne sont jamais bloqués : déploiement edge sûr avant rebuild des apps.
  const verdict = relevanceVerdictForContext(productContext, skin);
  if (wantCompat && verdict.kind === "profile_incomplete") {
    return jsonResponse({ profileIncomplete: true, missingSection: verdict.missingSection });
  }

  // ── CRÉDIT : seule la PREMIÈRE génération coûte 1 crédit ────────────────────
  // Si des blocs existent déjà mais que la clé est PÉRIMÉE (nouvelle version de
  // prompt, profil ou zone modifiés), c'est une RÉGÉNÉRATION d'un contenu DÉJÀ
  // PAYÉ : on ne re-débite JAMAIS (sinon une amélioration de notre part
  // coûterait au user, et un user à 0 crédit resterait bloqué sur d'anciens blocs).
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
  // familles QUE si l'utilisateur a des restrictions cochées : on le charge ici
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
    productContext,
    userId: user.id,
    profileBlock,
    restrictionsBlock: restrictions.block,
    restrictionMatches: matches,
    inferredRestrictionMatches: inferredMatches,
    // product_only = produit HORS PROFIL (dentifrice, déo…), profil/axe non
    // renseigné, ou zone non couverte par le profil (v29, demande user 16 juil
    // 2026) : le score suit la QUALITÉ de la formule, mais l'IA liste quand même
    // les bons actifs (utiles de manière globale) et les points à surveiller,
    // affichés à 0 point dans le détail du calcul. Seul verdict "personal" (axe
    // peau/cheveux rattaché ET renseigné pour cette zone) donne les bonus/malus.
    productOnly: verdict.kind !== "personal",
    // Filets déterministes (le LLM les rate parfois) : alcool asséchant, parfum,
    // comédogènes, sulfates, allergie déclarée, SELON LA ZONE ET L'USAGE du
    // produit (plus de comédogènes « peau grasse » sur un soin capillaire).
    // Uniquement en mode personal : hors sujet pour un produit hors profil.
    forcedAgainst: verdict.kind === "personal" ? detectForcedAgainst(items, skin, productContext) : [],
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
    // Trace de la zone retenue (support / audit : « pourquoi ce score ? »).
    personalContext: {
      axis: productContext.axis,
      zones: productContext.zones,
      usage: productContext.usage,
      source: productContext.source,
    },
  };
  await supabase
    .schema("cosme_check")
    .from("analyses")
    .update({ result_json: updatedJson })
    .eq("id", analysisId);

  return jsonResponse({ blocks, compatibility });
});
