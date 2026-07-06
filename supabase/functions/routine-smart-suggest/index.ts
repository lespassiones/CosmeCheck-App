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
 *
 * Règle de sélection (qualifie pour une suggestion) :
 *   1. orange > 0 OU rouge > 0            → toujours (obligatoire)
 *   2. sinon, ingrédient restreint présent → toujours
 *   3. sinon (vert/jaune only)            → seulement si jaune > vert
 *   (vert ≥ jaune et rien de restreint → déjà bon, aucune suggestion)
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

const EXACT_LIMIT = 30;
const SHORTLIST = 6; // candidats soumis à l'IA par produit
const GREEN_MIN = 13; // zone verte (« Bien »)
const MIN_IMPROVEMENT = 0.5;
const MAX_ITEMS = 40;

// ─── Règle de sélection (À GARDER EN PHASE avec mobile lib/routine/qualify.ts) ─
export function qualifiesForSuggestion(c: Counts, restrictedCount: number): boolean {
  if ((c.orange ?? 0) > 0 || (c.rouge ?? 0) > 0) return true;
  if ((restrictedCount ?? 0) > 0) return true;
  return (c.jaune ?? 0) > (c.vert ?? 0);
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
  return `v1-${h.toString(16)}-${canonical.length.toString(16)}`;
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

async function fetchAlternatives(sb: SB, category: string): Promise<CatalogAlt[]> {
  try {
    const { data, error } = await sb.rpc("cosme_check_alternatives_by_category_exact", {
      p_category: category, p_limit: EXACT_LIMIT, p_offset: 0,
    });
    if (error || !Array.isArray(data)) return [];
    return (data as Record<string, unknown>[]).map((row) => ({
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
  } catch { return []; }
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

/** Shortlist : restriction-clean + zone verte (≥13) + strictement meilleur, triée par note desc. */
function shortlist(productCapped: number, alts: CatalogAlt[], r: UserRestrictions, ownEan: string | null): CatalogAlt[] {
  const threshold = productCapped + MIN_IMPROVEMENT;
  return alts
    .filter((a) => a.ean && a.ean !== ownEan)
    .filter((a) => !altHitsRestriction(a, r))
    .filter((a) => (a.count_rouge ?? 0) === 0) // jamais un produit contenant du rouge
    .filter((a) => a.score >= GREEN_MIN && a.score > threshold)
    .sort((x, y) => y.score - x.score)
    .slice(0, SHORTLIST);
}

async function resolveCategory(item: ReqItem, catByEan: Map<string, string>, sb: SB): Promise<string | null> {
  const fromEan = item.ean ? catByEan.get(item.ean) ?? null : null;
  if (fromEan) return fromEan;
  if (item.category && item.category.trim()) return item.category.trim();
  return classifyByName(sb, item.name);
}

// ─── Classement IA batché (choisit LA meilleure par produit + « pourquoi ») ──

type RankTask = { idx: number; product: string; category: string; candidates: CatalogAlt[] };
type RankResult = { best_index: number; reason: string };

const RANK_SCHEMA = {
  name: "rank_alternatives",
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
          properties: { best_index: { type: "integer" }, reason: { type: "string" } },
          required: ["best_index", "reason"],
        },
      },
    },
    required: ["results"],
  },
} as const;

function buildRankPrompt(tasks: RankTask[], profileText: string): { system: string; user: string } {
  const system =
    "Tu es un expert cosmétique. Pour CHAQUE produit, on te donne sa catégorie et une liste numérotée d'ALTERNATIVES candidates (déjà plus propres et respectant les restrictions de l'utilisateur). "
    + "Choisis LA meilleure alternative pour CET utilisateur. "
    + "IMPORTANT : ne retiens du profil QUE ce qui est pertinent pour la catégorie du produit (ex : pour un shampoing, ignore les préoccupations du visage/pieds ; pour une crème visage, ignore l'état des cheveux). "
    + "Toutes les candidates sont DÉJÀ de la bonne catégorie, plus propres et respectent les restrictions : il y a donc presque toujours un bon choix. Choisis la plus adaptée au profil ; si le profil n'apporte rien de pertinent pour CETTE catégorie, prends simplement la MIEUX NOTÉE. "
    + "Ne renvoie best_index = 0 QUE si les candidates sont manifestement d'un TYPE de produit différent du produit (cas rare). Ne renvoie JAMAIS 0 juste parce que le profil ne correspond pas à la catégorie. "
    + "best_index est l'indice 1-based de la meilleure candidate (ou 0 dans le cas rare ci-dessus). "
    + "reason = une phrase courte en tutoiement expliquant pourquoi CE produit te correspond (mentionne l'élément de profil pertinent, ex : « pour ta peau sensible… »). Pas de superlatifs marketing. "
    + "Réponds en JSON strict : un élément par produit, MÊME ordre, MÊME nombre.";
  const blocks = tasks.map((t, i) => {
    const cands = t.candidates
      .map((c, k) => `   ${k + 1}. ${[c.brand, c.name].filter(Boolean).join(" ") || c.ean} (note ${c.score.toFixed(1)}/20)`)
      .join("\n");
    return `Produit ${i + 1} : "${t.product}" (catégorie : ${t.category})\n  Alternatives :\n${cands}`;
  }).join("\n\n");
  const user = `Profil de l'utilisateur : ${profileText}\n\n${blocks}\n\nRetourne { "results": [{ "best_index", "reason" }] } (un par produit, même ordre).`;
  return { system, user };
}

function parseRank(raw: string | null, n: number): RankResult[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { results?: unknown };
    const arr = Array.isArray(parsed.results) ? parsed.results : null;
    if (!arr || arr.length !== n) return null;
    return arr.map((r) => {
      const o = (r ?? {}) as Record<string, unknown>;
      const bi = typeof o.best_index === "number" ? Math.trunc(o.best_index) : 1;
      return { best_index: bi, reason: typeof o.reason === "string" ? o.reason.slice(0, 220) : "" };
    });
  } catch { return null; }
}

async function rankAll(tasks: RankTask[], profileText: string, userId: string): Promise<RankResult[]> {
  // Défaut déterministe : meilleure note (index 1), pas de raison.
  const deterministic = (): RankResult[] => tasks.map(() => ({ best_index: 1, reason: "" }));
  if (tasks.length === 0) return [];
  if (!hasOpenAI() && !hasMistral()) return deterministic();
  const { system, user } = buildRankPrompt(tasks, profileText);
  try {
    const res = await callWithFallback<RankResult[] | null>({
      feature: "categorize",
      userId,
      timeoutMs: 22_000,
      primary: async () => {
        if (!hasOpenAI()) throw new Error("openai disabled");
        const resp = await openai().chat.completions.create({
          model: AI_MODEL,
          temperature: 0,
          max_tokens: 120 * tasks.length + 200,
          messages: [{ role: "system", content: system }, { role: "user", content: user }],
          response_format: { type: "json_schema", json_schema: RANK_SCHEMA },
        });
        return {
          value: parseRank(resp.choices?.[0]?.message?.content ?? null, tasks.length),
          tokensIn: resp.usage?.prompt_tokens,
          tokensOut: resp.usage?.completion_tokens,
        };
      },
      fallback: async () => {
        if (!hasMistral()) return { value: null, provider: "mistral" as const };
        const raw = await mistralChat({
          temperature: 0,
          maxTokens: 120 * tasks.length + 200,
          responseFormat: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: `${user}\n\nFormat strict: { "results": [{"best_index": int, "reason": "..."}] }` },
          ],
        });
        return { value: parseRank(raw, tasks.length), provider: "mistral" as const };
      },
    });
    return res ?? deterministic();
  } catch {
    return deterministic();
  }
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

  // Résolution catégorie + shortlist pour les produits à générer.
  const eans = Array.from(new Set(toGenerate.map((i) => i.ean).filter((e): e is string => Boolean(e))));
  const catByEan = await categoriesByEan(svc, eans);

  const prepared = await Promise.all(
    toGenerate.map(async (item) => {
      let category = await resolveCategory(item, catByEan, svc);
      let cands = category ? shortlist(item.cappedScore, await fetchAlternatives(svc, category), restrictions, item.ean) : [];
      if (cands.length === 0) {
        // Re-route par nom (taxonomie catalogue fiable) si la catégorie ne donne rien.
        const byName = await classifyByName(svc, item.name);
        if (byName && byName !== category) {
          const reCands = shortlist(item.cappedScore, await fetchAlternatives(svc, byName), restrictions, item.ean);
          if (reCands.length > 0) { category = byName; cands = reCands; }
        }
      }
      return { item, category, cands };
    }),
  );

  // Classement IA batché sur les produits ayant au moins un candidat.
  const rankTasks: RankTask[] = [];
  const rankMap: number[] = []; // rankTasks[i] → index dans prepared
  prepared.forEach((p, i) => {
    if (p.cands.length > 0 && p.category) {
      rankMap.push(i);
      rankTasks.push({ idx: i, product: p.item.name, category: p.category, candidates: p.cands });
    }
  });
  const ranks = await rankAll(rankTasks, profileText, user.id);

  // Choix final par produit à générer.
  const chosen = new Map<string, { alternative: AltOut | null; reason: string | null; category: string | null }>();
  prepared.forEach((p) => {
    chosen.set(p.item.analysisId, { alternative: null, reason: null, category: p.category });
  });
  rankTasks.forEach((t, k) => {
    const verdict = ranks[k] ?? { best_index: 1, reason: "" };
    const p = prepared[t.idx];
    // La shortlist est déjà même-catégorie + propre + sans restriction : on ne
    // « drope » JAMAIS un produit qualifié (suggestion obligatoire pour orange/
    // rouge/restreint). best_index hors borne (0 = « aucune » de l'IA) → repli
    // sur la mieux notée. L'IA sert à personnaliser le CHOIX + la raison.
    let idx = verdict.best_index;
    if (!(idx >= 1 && idx <= p.cands.length)) idx = 1;
    const a = p.cands[idx - 1];
    const lt = scoreLabelTone(a.score);
    chosen.set(p.item.analysisId, {
      alternative: {
        ean: a.ean, brand: a.brand, name: a.name, image_url: a.image_url, score: a.score,
        score_label: lt.label, score_tone: lt.tone, ingredients_text: a.ingredients_text,
      },
      reason: verdict.reason || null,
      category: p.category,
    });
  });

  // Débit crédit PAR produit généré avec alternative, + persistance cache.
  // On lit le solde une fois ; au-delà, les produits restants sont `locked`.
  let remaining = g.credits.remaining;
  try {
    const { data: credData } = await g.supabase.rpc("cosme_check_get_credits");
    const cd = (credData ?? {}) as { remaining?: number };
    if (typeof cd.remaining === "number") remaining = cd.remaining;
  } catch { /* garde g.credits.remaining */ }

  const lockedIds = new Set<string>();
  let generatedCount = 0;
  for (const item of toGenerate) {
    const c = chosen.get(item.analysisId)!;
    if (c.alternative) {
      if (remaining <= 0) { lockedIds.add(item.analysisId); continue; }
      const charge = await g.consumeCredit("routine_suggest");
      if (!charge.ok) { lockedIds.add(item.analysisId); remaining = 0; continue; }
      remaining = charge.credits.remaining;
      generatedCount++;
    }
    // Persiste (alternative réelle OU null mémorisé pour ne pas re-générer/re-débiter).
    // On NE persiste PAS les produits verrouillés faute de crédits (retry possible plus tard).
    if (!lockedIds.has(item.analysisId)) {
      await svc.schema("cosme_check").from("routine_suggestions").upsert({
        user_id: user.id, analysis_id: item.analysisId, profile_sig: sig,
        alternative: c.alternative, reason: c.reason, product_name: item.name, category: c.category,
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

  return jsonResponse({ suggestions, generatedCount, creditsRemaining: remaining });
});
