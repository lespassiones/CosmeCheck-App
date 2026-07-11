/**
 * Edge Function `routine-smart-suggest` — moteur UNIQUE des « Suggestions
 * intelligentes » (routine), partagé mobile + web pour garantir la parité.
 *
 * Contrat :
 *   - Le client envoie TOUS les produits de la routine (analysisId, name, ean,
 *     category, counts {vert,jaune,orange,rouge}, cappedScore, restrictedCount).
 *   - Le serveur décide QUI reçoit une suggestion (règle ci-dessous), résout la
 *     catégorie, récupère des alternatives (RPC catégorie exacte), filtre
 *     (restrictions + zone verte + strictement meilleur), puis l'IA choisit LA
 *     meilleure pour CE profil et donne un « pourquoi pour toi ».
 *   - DEUXIÈME TOUR (garantie qualité) : avant d'afficher/débiter, un contrôle IA
 *     indépendant vérifie que l'alternative choisie répond au MÊME besoin d'usage
 *     que le produit actuel (basé sur les NOMS, pas la catégorie catalogue qui peut
 *     être fausse). Incompatible → aucune suggestion (0 crédit). En complément,
 *     best_index=0 de l'IA de classement (type manifestement différent) est respecté.
 *
 * Règle de sélection (qualifie pour une suggestion) :
 *   1. orange > 0 OU rouge > 0            → toujours (obligatoire)
 *   2. sinon, ingrédient restreint présent → toujours
 *   3. sinon (vert/jaune only)            → seulement si jaune > vert
 *   (vert ≥ jaune et rien de restreint → déjà bon, aucune suggestion)
 *   (garder YELLOW_DOMINANCE_FACTOR EN PHASE avec mobile lib/routine/qualify.ts)
 *
 * Crédits & cache (SERVEUR, autoritatif) :
 *   - Cache par produit : table cosme_check.routine_suggestions
 *     (user_id, analysis_id, profile_sig). profile_sig = empreinte profil+restrictions.
 *   - 1 crédit débité par produit RÉELLEMENT généré (alternative trouvée).
 *   - Déjà en cache → renvoyé tel quel, 0 crédit. Profil changé (sig différent) →
 *     régénéré (et re-débité). Crédits épuisés → produits restants renvoyés `locked`.
 */
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { gate } from "../_shared/gate.ts";
import { serviceClient } from "../_shared/auth.ts";
import {
  AI_MODEL,
  callWithFallback,
  hasMistral,
  hasOpenAI,
  mistralChat,
  openai,
} from "../_shared/aiClient.ts";

type Counts = { vert: number; jaune: number; orange: number; rouge: number };

type ReqItem = {
  analysisId: string;
  name: string;
  ean: string | null;
  category: string | null; // category_precise côté client (fallback)
  counts: Counts;
  cappedScore: number;
  restrictedCount: number;
};

type AltOut = {
  ean: string;
  brand: string | null;
  name: string | null;
  image_url: string | null;
  score: number;
  score_label: string;
  score_tone: string;
  ingredients_text: string | null;
};

/** Libellé + ton depuis la note (convention unique : ≥13 vert). */
function scoreLabelTone(s: number): { label: string; tone: string } {
  if (s >= 17) return { label: "Très bien", tone: "green" };
  if (s >= 13) return { label: "Bien", tone: "green" };
  if (s >= 9) return { label: "Moyen", tone: "amber" };
  if (s >= 5) return { label: "Faible", tone: "orange" };
  return { label: "Faible", tone: "rose" };
}

type SuggestionOut = {
  analysisId: string;
  productName: string;
  productScore: number;
  /** Photo du produit de la routine (catalogue via EAN), sinon null → placeholder. */
  productImageUrl: string | null;
  dangerColor: "rouge" | "orange" | null;
  alternative: AltOut | null;
  reason: string | null;
  locked: boolean;
};

const EXACT_LIMIT = 50; // candidats catalogue récupérés (par note) avant filtre « propre »
const SHORTLIST = 6; // candidats soumis à l'IA par produit
const GREEN_MIN = 13; // zone verte (« Bien »)
const MAX_ITEMS = 40;

// Version du MOTEUR : incluse dans profile_sig → un changement de logique
// invalide TOUT le cache existant (régénération à la prochaine ouverture, comme
// le bump de clé localStorage côté web). Bumper à chaque évolution de la règle.
const ENGINE_VERSION = "e3";

// ─── Règle de sélection (À GARDER EN PHASE avec mobile lib/routine/qualify.ts) ─
// Le jaune doit simplement DÉPASSER le vert (jaune > vert) pour un produit sans
// orange/rouge/restriction ; sinon il est déjà bon -> pas de suggestion.
const YELLOW_DOMINANCE_FACTOR = 1.0;
export function qualifiesForSuggestion(c: Counts, restrictedCount: number): boolean {
  if ((c.orange ?? 0) > 0 || (c.rouge ?? 0) > 0) return true;
  if ((restrictedCount ?? 0) > 0) return true;
  return (c.jaune ?? 0) > (c.vert ?? 0) * YELLOW_DOMINANCE_FACTOR;
}

function severity(c: Counts, restrictedCount: number, capped: number): number {
  return (
    (restrictedCount > 0 ? 1000 : 0) +
    (c.rouge ?? 0) * 40 +
    (c.orange ?? 0) * 15 +
    Math.max(0, 20 - (capped ?? 20))
  );
}

function dangerColorOf(c: Counts, restrictedCount: number, capped: number): "rouge" | "orange" | null {
  if ((c.rouge ?? 0) > 0 || restrictedCount > 0 || (capped ?? 20) < 5) return "rouge";
  if ((c.orange ?? 0) > 0) return "orange";
  return null;
}

// ─── Profil + restrictions ──────────────────────────────────────────────────

const SKIN_TYPE_FACE_LABEL: Record<string, string> = {
  seche: "Sèche", mixte: "Mixte", grasse: "Grasse", sensible: "Sensible", normale: "Normale",
};
const SKIN_TYPE_BODY_LABEL: Record<string, string> = {
  seche: "Sèche", tres_seche: "Très sèche / atopique", normale: "Normale",
  sensible: "Sensible / réactive", mixte: "Mixte (zones sèches et grasses)",
};
const SKIN_CONCERN_LABEL: Record<string, string> = {
  acne: "Acné / boutons", rides: "Rides et ridules", taches: "Taches pigmentaires",
  secheresse: "Sécheresse / déshydratation", rougeurs: "Rougeurs", sensibilite: "Sensibilité",
  pores_dilates: "Pores dilatés", exces_sebum: "Excès de sébum / brillance",
  cernes_poches: "Cernes / poches", vergetures_cellulite: "Cellulite / vergetures",
};
const HAIR_CONCERN_LABEL: Record<string, string> = {
  secs: "Secs", gras: "Gras", cuir_chevelu_sensible: "Cuir chevelu sensible / affecté",
  chute: "Chute de cheveux", pellicules: "Pellicules", ternes_cassants: "Cheveux ternes / cassants",
};
const PROFILE_GOAL_LABEL: Record<string, string> = {
  peau_douce: "Peau plus douce", teint_uniforme: "Teint uniforme", attenuer_boutons: "Atténuer les boutons",
  reduire_rides: "Réduire les rides", calmer_rougeurs: "Calmer les rougeurs", hydrater_profondeur: "Hydrater en profondeur",
  reduire_taches: "Réduire les taches", renforcer_barriere: "Renforcer la barrière cutanée",
  adoucir_corps: "Adoucir le corps", reduire_vergetures: "Réduire les vergetures", proteger_soleil: "Protéger du soleil",
  cheveux_brillants: "Cheveux brillants", renforcer_cheveux: "Renforcer les cheveux", definir_boucles: "Définir les boucles",
  cuir_chevelu_sain: "Cuir chevelu sain", reduire_chute: "Réduire la chute", simplifier_routine: "Simplifier la routine",
  decouvrir_clean: "Découvrir des produits clean",
};

type SkinProfile = {
  skinTypeFace?: string; otherSkinTypeFace?: string;
  skinTypeBody?: string; otherSkinTypeBody?: string;
  concerns?: string[]; hairConcerns?: string[];
  goals?: string[];
  allergiesFreeform?: string; otherConcerns?: string; otherHair?: string; otherNotes?: string; otherGoals?: string;
};
type UserRestrictions = { families: string[]; ingredients: { slug: string; name: string }[] };

function str(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t.slice(0, max) : undefined;
}
function strArr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0) : [];
}

function readSkinProfile(prefs: Record<string, unknown> | null): SkinProfile {
  const raw = (prefs as { skin?: unknown } | null)?.skin;
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const concerns = strArr(r.concerns).map((c) => (c === "anti-age" ? "rides" : c)).filter((c) => c !== "cuir_chevelu" && c !== "cheveux");
  return {
    skinTypeFace: str(r.skinTypeFace, 40),
    otherSkinTypeFace: str(r.otherSkinTypeFace, 120),
    skinTypeBody: str(r.skinTypeBody, 40) ?? str(r.skinType, 40),
    otherSkinTypeBody: str(r.otherSkinTypeBody, 120) ?? str(r.otherSkinType, 120),
    concerns: concerns.length ? concerns : undefined,
    hairConcerns: strArr(r.hairConcerns).length ? strArr(r.hairConcerns) : undefined,
    goals: strArr(r.goals).length ? strArr(r.goals) : undefined,
    allergiesFreeform: str(r.allergiesFreeform, 500),
    otherConcerns: str(r.otherConcerns, 300),
    otherHair: str(r.otherHair, 200),
    otherNotes: str(r.otherNotes, 500),
    otherGoals: str(r.otherGoals, 300),
  };
}

function readUserRestrictions(prefs: Record<string, unknown> | null): UserRestrictions {
  const raw = (prefs as { restrictions?: unknown } | null)?.restrictions;
  if (!raw || typeof raw !== "object") return { families: [], ingredients: [] };
  const r = raw as Record<string, unknown>;
  const families = strArr(r.families).slice(0, 60);
  const ingredients = Array.isArray(r.ingredients)
    ? (r.ingredients as unknown[])
        .map((it) => {
          const o = (it ?? {}) as Record<string, unknown>;
          const name = str(o.name, 120);
          return name ? { slug: str(o.slug, 120) ?? name, name } : null;
        })
        .filter((x): x is { slug: string; name: string } => x !== null)
        .slice(0, 100)
    : [];
  return { families, ingredients };
}

/** Résumé profil pour l'IA (le LLM ne retient que ce qui est pertinent par catégorie). */
function profileSummary(skin: SkinProfile): string {
  const lines: string[] = [];
  if (skin.skinTypeFace) lines.push(`Peau visage : ${SKIN_TYPE_FACE_LABEL[skin.skinTypeFace] ?? skin.skinTypeFace}${skin.otherSkinTypeFace ? ` (${skin.otherSkinTypeFace})` : ""}`);
  if (skin.skinTypeBody) lines.push(`Peau corps : ${SKIN_TYPE_BODY_LABEL[skin.skinTypeBody] ?? skin.skinTypeBody}${skin.otherSkinTypeBody ? ` (${skin.otherSkinTypeBody})` : ""}`);
  if (skin.concerns?.length) lines.push(`Préoccupations peau : ${skin.concerns.map((c) => SKIN_CONCERN_LABEL[c] ?? c).join(", ")}`);
  if (skin.hairConcerns?.length) lines.push(`Cheveux : ${skin.hairConcerns.map((c) => HAIR_CONCERN_LABEL[c] ?? c).join(", ")}`);
  if (skin.goals?.length) lines.push(`Objectifs : ${skin.goals.map((g) => PROFILE_GOAL_LABEL[g] ?? g).join(", ")}`);
  if (skin.otherConcerns) lines.push(`Autre préoccupation : ${skin.otherConcerns}`);
  if (skin.otherGoals) lines.push(`Autre objectif : ${skin.otherGoals}`);
  if (skin.allergiesFreeform) lines.push(`Allergies : ${skin.allergiesFreeform}`);
  return lines.length ? lines.join(" ; ") : "Aucune information de profil.";
}

/** Empreinte stable profil + restrictions (change → régénération des recos). */
function profileSig(skin: SkinProfile, r: UserRestrictions): string {
  const canonical = [
    skin.skinTypeFace ?? "", skin.otherSkinTypeFace ?? "",
    skin.skinTypeBody ?? "", skin.otherSkinTypeBody ?? "",
    [...(skin.concerns ?? [])].sort().join(","),
    [...(skin.hairConcerns ?? [])].sort().join(","),
    [...(skin.goals ?? [])].sort().join(","),
    skin.allergiesFreeform ?? "", skin.otherConcerns ?? "", skin.otherHair ?? "", skin.otherNotes ?? "", skin.otherGoals ?? "",
    [...r.families].sort().join(","),
    [...r.ingredients.map((i) => i.name.toLowerCase())].sort().join(","),
  ].join("|");
  // FNV-1a 32-bit → hex (suffisant comme clé de cache).
  let h = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) {
    h ^= canonical.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return `${ENGINE_VERSION}-${h.toString(16)}-${canonical.length.toString(16)}`;
}

// ─── Alternatives (catégorie exacte) ────────────────────────────────────────

const DIACRITICS_RE = new RegExp("[\\u0300-\\u036f]", "g");
function deburr(s: string): string {
  return s.normalize("NFD").replace(DIACRITICS_RE, "").toLowerCase();
}

type CatalogAlt = {
  ean: string; brand: string | null; name: string | null; category: string | null;
  image_url: string | null; score: number; ingredients_text: string | null;
  count_orange: number; count_rouge: number;
};

// deno-lint-ignore no-explicit-any
type SB = any;

async function categoriesByEan(sb: SB, eans: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (eans.length === 0) return out;
  try {
    const { data } = await sb.schema("cosme_check").from("catalog").select("ean, category").in("ean", eans);
    for (const r of (data as { ean: string; category: string | null }[] | null) ?? []) {
      if (r.category && r.category.trim()) out.set(String(r.ean), r.category.trim());
    }
  } catch { /* ignore */ }
  return out;
}

/** Photo produit de la routine (catalogue via EAN) — 1 requête pour tous. */
async function imagesByEan(sb: SB, eans: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (eans.length === 0) return out;
  try {
    const { data } = await sb.schema("cosme_check").from("catalog").select("ean, image_url").in("ean", eans);
    for (const r of (data as { ean: string; image_url: string | null }[] | null) ?? []) {
      if (r.image_url && r.image_url.trim()) out.set(String(r.ean), r.image_url.trim());
    }
  } catch { /* ignore */ }
  return out;
}

async function classifyByName(sb: SB, name: string): Promise<string | null> {
  const q = name.trim();
  if (q.length < 3) return null;
  try {
    const { data, error } = await sb.rpc("cosme_check_classify_product_category", { p_query: q });
    if (!error && Array.isArray(data) && data.length > 0) {
      const cat = (data[0] as { category?: string }).category?.trim();
      if (cat) return cat;
    }
  } catch { /* ignore */ }
  return null;
}

function mapCatalogAlt(rows: unknown): CatalogAlt[] {
  if (!Array.isArray(rows)) return [];
  return (rows as Record<string, unknown>[]).map((row) => ({
    ean: String(row.ean ?? ""),
    brand: (row.brand as string | null) ?? null,
    name: (row.name as string | null) ?? null,
    category: (row.category as string | null) ?? null,
    image_url: (row.image_url as string | null) ?? null,
    score: (row.score as number) ?? 0,
    ingredients_text: (row.ingredients_text as string | null) ?? null,
    count_orange: (row.count_orange as number) ?? 0,
    count_rouge: (row.count_rouge as number) ?? 0,
  }));
}

/** Feuille exacte (ex. `hygiene-du-corps/deodorant/anti-transpirant`). */
async function fetchAlternatives(sb: SB, category: string): Promise<CatalogAlt[]> {
  try {
    const { data, error } = await sb.rpc("cosme_check_alternatives_by_category_exact", {
      p_category: category, p_limit: EXACT_LIMIT, p_offset: 0,
    });
    if (error) return [];
    return mapCatalogAlt(data);
  } catch { return []; }
}

/** Catégorie PARENTE = toutes les feuilles sœurs sous le même parent, ex. préfixe
 *  `hygiene-du-corps/deodorant/%`. Sert de repli quand la feuille exacte est
 *  affamée (peu/pas de produits propres) alors que les sœurs en regorgent
 *  (cf. « thin-category-facet-starvation »). */
async function fetchAlternativesByPrefix(sb: SB, prefix: string): Promise<CatalogAlt[]> {
  try {
    const { data, error } = await sb.rpc("cosme_check_alternatives_by_category_prefix", {
      p_prefix: prefix, p_limit: EXACT_LIMIT, p_offset: 0,
    });
    if (error) return [];
    return mapCatalogAlt(data);
  } catch { return []; }
}

/** Préfixe parent d'un chemin de catégorie : `a/b/c` → `a/b/%` (null si pas de parent). */
function parentPrefix(category: string): string | null {
  const parts = category.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  return `${parts.slice(0, -1).join("/")}/%`;
}

function altHitsRestriction(alt: CatalogAlt, r: UserRestrictions): boolean {
  if (!r.ingredients.length) return false;
  const text = deburr(alt.ingredients_text ?? "");
  if (!text) return false;
  return r.ingredients.some((ing) => {
    const needle = deburr(ing.name).trim();
    return needle.length >= 3 && text.includes(needle);
  });
}

/**
 * Shortlist déterministe = 1re « réanalyse » de la recette via les compteurs
 * couleur AUTORITATIFS (product_score_cap : count_orange/count_rouge) + scan des
 * ingrédients explicitement bannis. On ne garde QUE des alternatives réellement
 * PROPRES :
 *   - 0 rouge ET 0 orange (jamais un produit pénalisant, comme le produit actuel) ;
 *   - note ≥ 13 (zone verte « Bien ») ;
 *   - aucun ingrédient nommé restreint par l'utilisateur ;
 *   - EAN ≠ produit lui-même.
 *
 * On NE compare PLUS sur la note brute du produit. Raison : le color cap est
 * neutralisé (lib/analysis/scoreCap.ts) → un produit SALE peut garder une note
 * brute élevée (ex. déo Dove 3 rouge/3 orange mais note 19,2). L'ancien seuil
 * « note_alt > note_produit + 0,5 » privait alors TOUT produit orange/rouge de
 * suggestion (bug « ces produits sont déjà propres »). La propreté (0 orange /
 * 0 rouge) est le vrai critère « mieux ».
 *
 * Exception : quand le produit qualifie UNIQUEMENT par dominance jaune (0 orange,
 * 0 rouge, aucune restriction), on exige une note strictement meilleure pour
 * éviter un remplacement latéral sans gain.
 *
 * Trié par note desc, top SHORTLIST — soumis ensuite à la réanalyse IA.
 */
function shortlist(item: ReqItem, alts: CatalogAlt[], r: UserRestrictions): CatalogAlt[] {
  const pureYellow =
    (item.counts.orange ?? 0) === 0 &&
    (item.counts.rouge ?? 0) === 0 &&
    (item.restrictedCount ?? 0) === 0;
  return alts
    .filter((a) => a.ean && a.ean !== item.ean)
    .filter((a) => (a.count_rouge ?? 0) === 0 && (a.count_orange ?? 0) === 0)
    .filter((a) => a.score >= GREEN_MIN)
    .filter((a) => !pureYellow || a.score > item.cappedScore)
    .filter((a) => !altHitsRestriction(a, r))
    .sort((x, y) => y.score - x.score)
    .slice(0, SHORTLIST);
}

async function resolveCategory(item: ReqItem, catByEan: Map<string, string>, sb: SB): Promise<string | null> {
  const fromEan = item.ean ? catByEan.get(item.ean) ?? null : null;
  if (fromEan) return fromEan;
  if (item.category && item.category.trim()) return item.category.trim();
  return classifyByName(sb, item.name);
}

// ─── Réanalyse IA : type d'usage + restrictions + profil (2 passes max) ───────
// Pour CHAQUE produit qualifié, on soumet à l'IA ses candidats DÉJÀ PROPRES (0
// orange / 0 rouge + note ≥ 13, filtrés côté serveur) AVEC leur RECETTE (INCI).
// L'IA « réanalyse » chaque recette et renvoie jusqu'à DEUX meilleurs candidats
// (best-first) qui sont À LA FOIS : (1) le MÊME type/usage/zone que le produit
// actuel, (2) dont la recette RESPECTE les restrictions (familles + ingrédients
// nommés), (3) adaptés au profil. [] si aucun n'est valide. L'appelant tente
// ensuite l'indice 1 (pass 1) puis l'indice 2 (pass 2) avec un garde
// déterministe — d'où « 2 passes maximum ».

type EvalCand = { n: number; label: string; inci: string };
type EvalTask = { idx: number; product: string; candidates: EvalCand[] };
type EvalResult = { best_indices: number[]; reason: string };

const EVAL_SCHEMA = {
  name: "evaluate_alternatives",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      results: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            best_indices: { type: "array", items: { type: "integer" } },
            reason: { type: "string" },
          },
          required: ["best_indices", "reason"],
        },
      },
    },
    required: ["results"],
  },
} as const;

function buildEvalPrompt(
  tasks: EvalTask[],
  profileText: string,
  restrictionText: string,
): { system: string; user: string } {
  const system =
    "Tu es un expert cosmétique rigoureux. Pour CHAQUE produit de la routine de l'utilisateur, on te donne son nom et une liste numérotée d'ALTERNATIVES candidates (déjà plus propres : sans ingrédient orange/rouge, bien notées). Chaque candidate a sa RECETTE (INCI). "
    + "RÉANALYSE la recette de chaque candidate et sélectionne jusqu'à DEUX meilleures candidates (best-first) qui remplissent TOUTES ces conditions : "
    + "(1) MÊME ZONE d'application (visage / corps / cheveux / bouche-dents / aisselles) ET MÊME usage (laver-rincer ; hydrater-laisser poser ; déodorer ; démaquiller...). La TEXTURE/forme peut différer tant que la zone ET l'usage sont identiques. "
    + "COMPATIBLES (exemples) : pour HYDRATER le corps, lait ↔ crème ↔ baume ↔ beurre corporel ; pour LAVER le corps, gel douche ↔ crème lavante ↔ savon liquide corps ↔ huile de douche ↔ body wash ↔ pain surgras ; pour les AISSELLES, déodorant ↔ anti-transpirant ↔ déo stick/bille/spray/crème (proposer un déodorant SANS sels d'aluminium à la place d'un anti-transpirant à l'aluminium est un TRÈS BON remplacement) ; deux nettoyants VISAGE (gel/mousse/huile/gelée) ; deux dentifrices ; deux shampooings. "
    + "INCOMPATIBLES (zone OU usage différent) : gel douche (laver le corps) ≠ shampooing (laver les cheveux) ; laver ≠ hydrater ; soin VISAGE ≠ soin CORPS ; dentifrice ≠ déodorant ; démaquillant/nettoyant ≠ crème de jour ; soin cheveux ≠ soin peau. "
    + "(2) la recette RESPECTE les restrictions : elle NE doit contenir AUCUN ingrédient d'une famille bannie NI aucun ingrédient nommé banni. Reconnais les familles dans l'INCI : sulfate = ...SULFATE (sodium lauryl/laureth/coco sulfate...) ; silicone = DIMETHICONE, ...SILOXANE, ...SILANOL, ...-CONE/-CONOL ; paraben = ...PARABEN ; ethoxyle (éthoxylé) = PEG-..., ...-ETH-... (LAURETH, STEARETH, CETEARETH...), POLYSORBATE ; propoxyle = PPG-.... "
    + "(3) raisonnablement adaptée au profil (type de peau, préoccupations, objectifs) — ne retiens du profil que ce qui est pertinent pour CE type de produit. "
    + "Si AUCUNE candidate ne remplit tout → best_indices = []. En cas de DOUTE sur la ZONE, l'USAGE ou une RESTRICTION → EXCLURE la candidate. Mais NE rejette PAS une candidate seulement parce que sa TEXTURE/forme diffère (lait vs baume, gel vs crème lavante, savon liquide vs gel douche) si la zone et l'usage sont identiques. "
    + "best_indices = indices 1-based (max 2, best-first). reason = une phrase courte en tutoiement (≤ 18 mots) expliquant pourquoi CE TYPE de produit te convient, SANS nommer aucune marque ni produit (ex : « Plus doux pour ton corps très sec, et sans les ingrédients que tu évites »). Pas de marketing. "
    + "Réponds en JSON strict : un élément par produit, MÊME ordre, MÊME nombre.";
  const blocks = tasks
    .map((t, i) => {
      const cands = t.candidates
        .map((c) => `   ${c.n}. ${c.label}\n      INCI: ${c.inci || "(inconnu)"}`)
        .join("\n");
      return `Produit ${i + 1} : "${t.product}"\n  Candidates :\n${cands}`;
    })
    .join("\n\n");
  const user =
    `Profil : ${profileText}\nRestrictions : ${restrictionText}\n\n${blocks}\n\n`
    + `Retourne { "results": [{ "best_indices": [..], "reason": "" }] } (un par produit, même ordre).`;
  return { system, user };
}

function parseEval(raw: string | null, n: number): EvalResult[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { results?: unknown };
    const arr = Array.isArray(parsed.results) ? parsed.results : null;
    if (!arr || arr.length !== n) return null;
    return arr.map((r) => {
      const o = (r ?? {}) as Record<string, unknown>;
      const bi = Array.isArray(o.best_indices)
        ? (o.best_indices as unknown[])
            .map((x) => (typeof x === "number" ? Math.trunc(x) : NaN))
            .filter((x) => Number.isFinite(x) && x >= 1)
            .slice(0, 2)
        : [];
      return { best_indices: bi, reason: typeof o.reason === "string" ? o.reason.slice(0, 220) : "" };
    });
  } catch {
    return null;
  }
}

/**
 * Un EvalResult par tâche, OU `null` si l'IA est indisponible / échoue.
 * `null` → l'appelant S'ABSTIENT sans mémoriser de rejet (réessai au prochain
 * tour) : sans réanalyse IA on ne peut garantir NI le type NI les restrictions,
 * donc on ne devine jamais.
 */
async function evaluateAll(
  tasks: EvalTask[],
  profileText: string,
  restrictionText: string,
  userId: string,
): Promise<EvalResult[] | null> {
  if (tasks.length === 0) return [];
  if (!hasOpenAI() && !hasMistral()) return null;
  const { system, user } = buildEvalPrompt(tasks, profileText, restrictionText);
  try {
    return await callWithFallback<EvalResult[] | null>({
      feature: "categorize",
      userId,
      timeoutMs: 30_000,
      primary: async () => {
        if (!hasOpenAI()) throw new Error("openai disabled");
        const resp = await openai().chat.completions.create({
          model: AI_MODEL,
          temperature: 0,
          max_tokens: 160 * tasks.length + 300,
          messages: [{ role: "system", content: system }, { role: "user", content: user }],
          response_format: { type: "json_schema", json_schema: EVAL_SCHEMA },
        });
        return {
          value: parseEval(resp.choices?.[0]?.message?.content ?? null, tasks.length),
          tokensIn: resp.usage?.prompt_tokens,
          tokensOut: resp.usage?.completion_tokens,
        };
      },
      fallback: async () => {
        if (!hasMistral()) return { value: null, provider: "mistral" as const };
        const raw = await mistralChat({
          temperature: 0,
          maxTokens: 160 * tasks.length + 300,
          responseFormat: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: `${user}\n\nFormat strict: { "results": [{"best_indices": [int], "reason": "..."}] }` },
          ],
        });
        return { value: parseEval(raw, tasks.length), provider: "mistral" as const };
      },
    });
  } catch {
    return null;
  }
}

/** Résumé des restrictions (familles + ingrédients + allergies) pour le prompt IA. */
function restrictionSummary(r: UserRestrictions, skin: SkinProfile): string {
  const parts: string[] = [];
  if (r.families.length) parts.push(`Familles bannies : ${r.families.join(", ")}`);
  if (r.ingredients.length) parts.push(`Ingrédients bannis : ${r.ingredients.map((i) => i.name).join(", ")}`);
  if (skin.allergiesFreeform) parts.push(`Allergies / à éviter : ${skin.allergiesFreeform}`);
  return parts.length ? parts.join(" ; ") : "Aucune restriction.";
}

// ─── Handler ────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") return jsonResponse({ error: "Méthode non autorisée." }, { status: 405 });

  let body: { items?: unknown };
  try {
    body = (await req.json()) as { items?: unknown };
  } catch {
    return jsonResponse({ error: "Requête invalide." }, { status: 400 });
  }

  const items: ReqItem[] = Array.isArray(body.items)
    ? (body.items as unknown[]).map((raw) => {
        const o = (raw ?? {}) as Record<string, unknown>;
        const analysisId = typeof o.analysisId === "string" ? o.analysisId : "";
        const name = typeof o.name === "string" ? o.name.trim().slice(0, 200) : "";
        if (!analysisId || !name) return null;
        const c = (o.counts ?? {}) as Record<string, unknown>;
        const counts: Counts = {
          vert: Number(c.vert) || 0, jaune: Number(c.jaune) || 0,
          orange: Number(c.orange) || 0, rouge: Number(c.rouge) || 0,
        };
        return {
          analysisId,
          name,
          ean: typeof o.ean === "string" && o.ean.trim() ? o.ean.trim().slice(0, 40) : null,
          category: typeof o.category === "string" && o.category.trim() ? o.category.trim() : null,
          counts,
          cappedScore: typeof o.cappedScore === "number" ? o.cappedScore : (typeof o.score === "number" ? o.score : 20),
          restrictedCount: Number(o.restrictedCount) || 0,
        } satisfies ReqItem;
      }).filter((x): x is ReqItem => x !== null).slice(0, MAX_ITEMS)
    : [];

  // Auth + rate-limit, SANS débit (on débite par produit généré).
  const g = await gate(req, { feature: "routine_suggest", costCredits: 0, rateMax: 20 });
  if (!g.ok) return g.response;
  const { user } = g;

  if (items.length === 0) return jsonResponse({ suggestions: [], generatedCount: 0 });

  const svc = serviceClient();

  // Profil + restrictions (client user-scopé pour lire ses préférences).
  const { data: profRow } = await g.supabase
    .schema("cosme_check").from("user_profiles").select("preferences").eq("id", user.id).maybeSingle();
  const prefs = (profRow?.preferences ?? null) as Record<string, unknown> | null;
  const skin = readSkinProfile(prefs);
  const restrictions = readUserRestrictions(prefs);
  const sig = profileSig(skin, restrictions);
  const profileText = profileSummary(skin);

  // Produits qualifiés, triés par sévérité (les plus pénalisants d'abord).
  const qualifying = items
    .filter((it) => qualifiesForSuggestion(it.counts, it.restrictedCount))
    .sort((a, b) => severity(b.counts, b.restrictedCount, b.cappedScore) - severity(a.counts, a.restrictedCount, a.cappedScore));

  if (qualifying.length === 0) return jsonResponse({ suggestions: [], generatedCount: 0 });

  // Photos des produits de la routine (catalogue via EAN) — pour tous les
  // qualifiés (cache + nouveaux), indépendant du cache. 1 requête.
  const allEans = Array.from(new Set(qualifying.map((q) => q.ean).filter((e): e is string => Boolean(e))));
  const imgByEan = await imagesByEan(svc, allEans);

  // Cache existant pour ce profil.
  const ids = qualifying.map((q) => q.analysisId);
  const { data: cachedRows } = await svc
    .schema("cosme_check").from("routine_suggestions")
    .select("analysis_id, alternative, reason, category")
    .eq("user_id", user.id).eq("profile_sig", sig).in("analysis_id", ids);
  const cache = new Map<string, { alternative: AltOut | null; reason: string | null }>();
  for (const r of (cachedRows as { analysis_id: string; alternative: AltOut | null; reason: string | null }[] | null) ?? []) {
    cache.set(r.analysis_id, { alternative: r.alternative ?? null, reason: r.reason ?? null });
  }

  const toGenerate = qualifying.filter((q) => !cache.has(q.analysisId));

  // ── Crédits AVANT toute IA (règle produit) : on ne lance JAMAIS une
  // génération qu'on ne pourra pas débiter. Solde lu UNE fois ici ; seuls les
  // `remaining` produits les plus sévères sont préparés/évalués, le reste est
  // verrouillé d'emblée (0 coût IA, 0 crédit, pas de cache → re-tentable).
  // Lecture en échec → fail-closed (0) : on ne dépense pas d'IA à l'aveugle.
  let remaining = 0;
  try {
    const { data: credData } = await g.supabase.rpc("cosme_check_get_credits");
    const cd = (credData ?? {}) as { remaining?: number };
    if (typeof cd.remaining === "number") remaining = cd.remaining;
  } catch { /* fail-closed */ }

  const lockedIds = new Set<string>();
  const affordable = toGenerate.slice(0, Math.max(0, remaining));
  for (const item of toGenerate.slice(affordable.length)) lockedIds.add(item.analysisId);

  // Résolution catégorie + shortlist pour les produits à générer (finançables).
  const eans = Array.from(new Set(affordable.map((i) => i.ean).filter((e): e is string => Boolean(e))));
  const catByEan = await categoriesByEan(svc, eans);

  const prepared = await Promise.all(
    affordable.map(async (item) => {
      let category = await resolveCategory(item, catByEan, svc);
      let cands = category ? shortlist(item, await fetchAlternatives(svc, category), restrictions) : [];
      // Repli 1 — ÉLARGIR AUX SŒURS : la feuille exacte peut être affamée (ex. déo
      // « anti-transpirant » : ~91 produits, presque tous à l'aluminium) alors que
      // les feuilles sœurs (« deodorant-stick/bille/spray... ») contiennent des
      // milliers d'alternatives propres. On cherche alors dans la catégorie PARENTE.
      if (cands.length === 0 && category) {
        const prefix = parentPrefix(category);
        if (prefix) {
          cands = shortlist(item, await fetchAlternativesByPrefix(svc, prefix), restrictions);
        }
      }
      // Repli 2 — re-route par nom (taxonomie catalogue) si toujours rien.
      if (cands.length === 0) {
        const byName = await classifyByName(svc, item.name);
        if (byName && byName !== category) {
          let reCands = shortlist(item, await fetchAlternatives(svc, byName), restrictions);
          if (reCands.length === 0) {
            const p = parentPrefix(byName);
            if (p) reCands = shortlist(item, await fetchAlternativesByPrefix(svc, p), restrictions);
          }
          if (reCands.length > 0) { category = byName; cands = reCands; }
        }
      }
      return { item, category, cands };
    }),
  );

  // Réanalyse IA (type d'usage + restrictions + profil) sur les produits ayant
  // au moins un candidat propre. Un seul appel batché → jusqu'à 2 meilleurs
  // candidats par produit (best-first).
  const restrictionText = restrictionSummary(restrictions, skin);
  const evalTasks: EvalTask[] = [];
  prepared.forEach((p, i) => {
    if (p.cands.length > 0) {
      evalTasks.push({
        idx: i,
        product: p.item.name,
        candidates: p.cands.map((c, k) => ({
          n: k + 1,
          label: [c.brand, c.name].filter(Boolean).join(" ") || c.ean,
          inci: (c.ingredients_text ?? "").slice(0, 300),
        })),
      });
    }
  });
  const evals = await evaluateAll(evalTasks, profileText, restrictionText, user.id);

  // Choix final par produit à générer. `abstained` = IA indisponible → on ne
  // cache rien (réessai au prochain tour, sans mémoriser de rejet).
  type Chosen = { alternative: AltOut | null; reason: string | null; category: string | null; abstained: boolean };
  const chosen = new Map<string, Chosen>();
  prepared.forEach((p) => {
    chosen.set(p.item.analysisId, { alternative: null, reason: null, category: p.category, abstained: false });
  });

  // Garde déterministe (2e couche de « réanalyse », backstop de l'IA) : la recette
  // est-elle réellement propre (0 orange / 0 rouge) et sans ingrédient nommé banni ?
  const passesClean = (c: CatalogAlt): boolean =>
    (c.count_rouge ?? 0) === 0 && (c.count_orange ?? 0) === 0 && !altHitsRestriction(c, restrictions);

  if (evals === null) {
    // IA indisponible → s'abstenir pour tous les produits à générer (pas de cache).
    prepared.forEach((p) => {
      if (p.cands.length > 0) chosen.get(p.item.analysisId)!.abstained = true;
    });
  } else {
    evalTasks.forEach((t, k) => {
      const r = evals[k] ?? { best_indices: [], reason: "" };
      const p = prepared[t.idx];
      // 2 passes MAX : on tente l'indice 1 (pass 1) puis l'indice 2 (pass 2)
      // renvoyés par l'IA (best-first), chacun revalidé par le garde déterministe.
      let picked: CatalogAlt | null = null;
      for (const oneBased of (r.best_indices ?? []).slice(0, 2)) {
        const c = p.cands[oneBased - 1];
        if (c && passesClean(c)) { picked = c; break; }
      }
      if (picked) {
        const lt = scoreLabelTone(picked.score);
        chosen.set(p.item.analysisId, {
          alternative: {
            ean: picked.ean, brand: picked.brand, name: picked.name, image_url: picked.image_url,
            score: picked.score, score_label: lt.label, score_tone: lt.tone, ingredients_text: picked.ingredients_text,
          },
          reason: r.reason || null,
          category: p.category,
          abstained: false,
        });
      }
    });
  }

  // Débit crédit PAR produit généré avec alternative, + persistance cache.
  // Le solde a été lu AVANT l'IA ; le `remaining <= 0` ci-dessous n'est qu'un
  // filet anti-course (débit concurrent entre la lecture et ici).
  let generatedCount = 0;
  for (const item of affordable) {
    const c = chosen.get(item.analysisId)!;
    if (c.abstained) continue; // IA indispo → ne pas cacher, réessayer au prochain tour
    if (c.alternative) {
      if (remaining <= 0) { lockedIds.add(item.analysisId); continue; }
      const charge = await g.consumeCredit("routine_suggest");
      if (!charge.ok) { lockedIds.add(item.analysisId); remaining = 0; continue; }
      remaining = charge.credits.remaining;
      generatedCount++;
    }
    // Persiste l'alternative choisie OU null (mémorise « aucune alternative propre
    // trouvée » → pas de re-génération/re-débit). Un produit verrouillé (crédits
    // épuisés) n'est PAS caché (réessai possible plus tard).
    if (!lockedIds.has(item.analysisId)) {
      await svc.schema("cosme_check").from("routine_suggestions").upsert({
        user_id: user.id, analysis_id: item.analysisId, profile_sig: sig,
        alternative: c.alternative,
        reason: c.alternative ? c.reason : null,
        product_name: item.name, category: c.category,
      }, { onConflict: "user_id,analysis_id,profile_sig" });
    }
  }

  // Réponse : une entrée par produit qualifié (cache + nouveaux), ordre sévérité.
  const suggestions: SuggestionOut[] = qualifying.map((q) => {
    const fromCache = cache.get(q.analysisId);
    const fresh = chosen.get(q.analysisId);
    const res = fromCache ?? (fresh ? { alternative: fresh.alternative, reason: fresh.reason } : { alternative: null, reason: null });
    return {
      analysisId: q.analysisId,
      productName: q.name,
      productScore: q.cappedScore,
      productImageUrl: q.ean ? imgByEan.get(q.ean) ?? null : null,
      dangerColor: dangerColorOf(q.counts, q.restrictedCount, q.cappedScore),
      alternative: res.alternative,
      reason: res.reason,
      locked: lockedIds.has(q.analysisId),
    };
  });

  // `aiUnavailable` : l'IA n'a pas pu évaluer (abstention, rien caché) → le
  // client doit dire « réessaie dans un instant », PAS « aucune alternative ».
  return jsonResponse({
    suggestions,
    generatedCount,
    creditsRemaining: remaining,
    aiUnavailable: evals === null,
  });
});
