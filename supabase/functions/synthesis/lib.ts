/**
 * Helpers de la synthèse PERSONNALISÉE (Edge / Deno). Port de :
 *   - CosmetWiki/lib/ai/synthesis.ts            → generateSynthesis (prompt v11, variante personnalisée)
 *   - CosmetWiki/lib/skin/promptFormat.ts       → formatSkinProfileForPrompt
 *   - CosmetWiki/lib/skin/profile.ts            → readSkinProfile (+ labels)
 *   - CosmetWiki/lib/restrictions/promptFormat  → formatRestrictionsForPrompt + loadRestrictionsContext
 *   - CosmetWiki/lib/restrictions/types.ts      → readUserRestrictions / hasAnyRestriction
 *   - CosmetWiki/lib/restrictions/families.ts   → loadIngredientFamilies
 *   - CosmetWiki/lib/restrictions/check.ts      → checkRestrictions
 *
 * La variante personnalisée enrichit le prompt avec : le profil peau de
 * l'utilisateur, ses restrictions, et un flag [restriction: X] par ingrédient
 * matché. La clé de cache inclut le hash du profil + des restrictions pour que
 * deux utilisateurs aux profils différents ne se partagent PAS la même sortie.
 *
 * DÉGRADE GRACIEUSEMENT : sans clé OpenAI/Mistral, generateSynthesis renvoie
 * null sans jamais throw. Profil / restrictions absents = synthèse non
 * personnalisée (mêmes templates que la variante analyser).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AI_MODEL,
  callWithFallback,
  getCached,
  hasMistral,
  hasOpenAI,
  mistralChat,
  openai,
  setCached,
  sha256Hex,
} from "../_shared/aiClient.ts";
import { NO_LONG_DASHES_RULE, stripLongDashes } from "../_shared/sanitize.ts";

const MISTRAL_MODEL = "mistral-small-latest";

export type ColorRating = "Vert" | "Jaune" | "Orange" | "Rouge";

// ─── Skin profile (port de lib/skin/profile.ts, sous-ensemble nécessaire) ────

const SKIN_TYPES_FACE = ["seche", "mixte", "grasse", "sensible", "normale"] as const;
type SkinTypeFace = typeof SKIN_TYPES_FACE[number];
const SKIN_TYPE_FACE_LABEL: Record<SkinTypeFace, string> = {
  seche: "Sèche",
  mixte: "Mixte",
  grasse: "Grasse",
  sensible: "Sensible",
  normale: "Normale",
};

const SKIN_TYPES_BODY = ["seche", "tres_seche", "normale", "sensible", "mixte"] as const;
type SkinTypeBody = typeof SKIN_TYPES_BODY[number];
const SKIN_TYPE_BODY_LABEL: Record<SkinTypeBody, string> = {
  seche: "Sèche",
  tres_seche: "Très sèche / atopique",
  normale: "Normale",
  sensible: "Sensible / réactive",
  mixte: "Mixte (zones sèches et grasses)",
};

const SKIN_CONCERNS = [
  "acne", "rides", "taches", "secheresse", "rougeurs", "sensibilite",
  "pores_dilates", "exces_sebum", "cernes_poches", "vergetures_cellulite",
] as const;
type SkinConcern = typeof SKIN_CONCERNS[number] | "anti-age" | "cuir_chevelu" | "cheveux";
const SKIN_CONCERN_LABEL: Record<SkinConcern, string> = {
  acne: "Acné / boutons",
  rides: "Rides et ridules",
  taches: "Taches pigmentaires",
  secheresse: "Sécheresse / déshydratation",
  rougeurs: "Rougeurs",
  sensibilite: "Sensibilité",
  pores_dilates: "Pores dilatés",
  exces_sebum: "Excès de sébum / brillance",
  cernes_poches: "Cernes / poches",
  vergetures_cellulite: "Cellulite / vergetures",
  "anti-age": "Rides et ridules",
  cuir_chevelu: "Cuir chevelu",
  cheveux: "Cheveux (longueurs)",
};

const HAIR_CONCERNS = [
  "secs", "gras", "cuir_chevelu_sensible", "chute", "pellicules", "ternes_cassants",
] as const;
type HairConcern = typeof HAIR_CONCERNS[number];
const HAIR_CONCERN_LABEL: Record<HairConcern, string> = {
  secs: "Secs",
  gras: "Gras",
  cuir_chevelu_sensible: "Cuir chevelu sensible / affecté",
  chute: "Chute de cheveux",
  pellicules: "Pellicules",
  ternes_cassants: "Cheveux ternes / cassants",
};

export type SkinProfile = {
  skinTypeFace?: SkinTypeFace;
  otherSkinTypeFace?: string;
  skinTypeBody?: SkinTypeBody;
  otherSkinTypeBody?: string;
  concerns?: SkinConcern[];
  hairConcerns?: HairConcern[];
  allergiesFreeform?: string;
  otherConcerns?: string;
  otherHair?: string;
  otherNotes?: string;
};

/** Port byte-for-byte (champs utiles à la synthèse) de readSkinProfile. */
export function readSkinProfile(prefs: Record<string, unknown> | null | undefined): SkinProfile {
  if (!prefs || typeof prefs !== "object") return {};
  const raw = (prefs as { skin?: unknown }).skin;
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;

  const rawConcerns: SkinConcern[] = Array.isArray(r.concerns)
    ? (r.concerns as unknown[]).filter(
      (c): c is SkinConcern =>
        SKIN_CONCERNS.includes(c as (typeof SKIN_CONCERNS)[number])
        || c === "anti-age" || c === "cuir_chevelu" || c === "cheveux",
    )
    : [];
  const cleanedConcerns = rawConcerns
    .filter((c) => c !== "cuir_chevelu" && c !== "cheveux")
    .map((c) => (c === "anti-age" ? "rides" : c)) as SkinConcern[];

  const rawHair = Array.isArray(r.hairConcerns)
    ? (r.hairConcerns as unknown[]).filter((c): c is HairConcern => HAIR_CONCERNS.includes(c as HairConcern))
    : [];
  const hairSet = new Set<HairConcern>(rawHair);
  if (rawConcerns.includes("cuir_chevelu")) hairSet.add("cuir_chevelu_sensible");

  const readShort = (key: string, max: number): string | undefined => {
    const v = r[key];
    if (typeof v !== "string") return undefined;
    const trimmed = v.trim();
    return trimmed.length > 0 ? trimmed.slice(0, max) : undefined;
  };

  const skinTypeFace = SKIN_TYPES_FACE.includes(r.skinTypeFace as SkinTypeFace)
    ? (r.skinTypeFace as SkinTypeFace)
    : undefined;
  const otherSkinTypeFace = readShort("otherSkinTypeFace", 120);

  const newBody = SKIN_TYPES_BODY.includes(r.skinTypeBody as SkinTypeBody)
    ? (r.skinTypeBody as SkinTypeBody)
    : undefined;
  const legacyBody = SKIN_TYPES_BODY.includes(r.skinType as SkinTypeBody)
    ? (r.skinType as SkinTypeBody)
    : undefined;
  const skinTypeBody = newBody ?? legacyBody;
  const otherSkinTypeBody = readShort("otherSkinTypeBody", 120) ?? readShort("otherSkinType", 120);

  return {
    skinTypeFace,
    otherSkinTypeFace,
    skinTypeBody,
    otherSkinTypeBody,
    concerns: cleanedConcerns.length > 0 ? cleanedConcerns : undefined,
    hairConcerns: hairSet.size > 0 ? Array.from(hairSet) : undefined,
    allergiesFreeform: readShort("allergiesFreeform", 500),
    otherConcerns: readShort("otherConcerns", 300),
    otherHair: readShort("otherHair", 200),
    otherNotes: readShort("otherNotes", 500),
  };
}

/** Port byte-for-byte de formatSkinProfileForPrompt. Renvoie null si vide. */
export function formatSkinProfileForPrompt(skin: SkinProfile): string | null {
  const lines: string[] = [];

  const faceParts: string[] = [];
  if (skin.skinTypeFace) faceParts.push(SKIN_TYPE_FACE_LABEL[skin.skinTypeFace]);
  if (skin.otherSkinTypeFace) faceParts.push(`précision : ${skin.otherSkinTypeFace}`);
  if (faceParts.length > 0) lines.push(`- Type de peau visage : ${faceParts.join(" — ")}`);

  const bodyParts: string[] = [];
  if (skin.skinTypeBody) bodyParts.push(SKIN_TYPE_BODY_LABEL[skin.skinTypeBody]);
  if (skin.otherSkinTypeBody) bodyParts.push(`précision : ${skin.otherSkinTypeBody}`);
  if (bodyParts.length > 0) lines.push(`- Type de peau corps : ${bodyParts.join(" — ")}`);

  const concernParts: string[] = [];
  if (skin.concerns && skin.concerns.length > 0) {
    concernParts.push(skin.concerns.map((c) => SKIN_CONCERN_LABEL[c]).join(", "));
  }
  if (skin.otherConcerns) concernParts.push(skin.otherConcerns);
  if (concernParts.length > 0) lines.push(`- Préoccupations : ${concernParts.join(" ; ")}`);

  const hairParts: string[] = [];
  if (skin.hairConcerns && skin.hairConcerns.length > 0) {
    hairParts.push(skin.hairConcerns.map((c) => HAIR_CONCERN_LABEL[c]).join(", "));
  }
  if (skin.otherHair) hairParts.push(skin.otherHair);
  if (hairParts.length > 0) lines.push(`- Cheveux : ${hairParts.join(" ; ")}`);

  if (skin.allergiesFreeform) lines.push(`- Allergies / intolérances : ${skin.allergiesFreeform}`);
  if (skin.otherNotes) lines.push(`- Autres précisions : ${skin.otherNotes}`);

  if (lines.length === 0) return null;

  return [
    "PROFIL DE L'UTILISATEUR (à prendre en compte pour personnaliser ta réponse) :",
    ...lines,
    "Adapte tes recommandations à ce profil. Cite les éléments du profil quand c'est pertinent (ex : « pour une peau sèche, … »).",
  ].join("\n");
}

// ─── Restrictions (port de lib/restrictions/*) ───────────────────────────────

export type RestrictedIngredient = { slug: string; name: string };
export type UserRestrictions = { families: string[]; ingredients: RestrictedIngredient[] };
export const EMPTY_RESTRICTIONS: UserRestrictions = { families: [], ingredients: [] };

export type IngredientFamily = {
  slug: string;
  tagSlug: string | null;
  name: string;
  descriptionSimple: string;
  sortOrder: number;
};

export type RestrictionMatch = {
  kind: "family" | "ingredient";
  slug: string;
  label: string;
  position: number;
  inciName: string;
};

export function readUserRestrictions(
  prefs: Record<string, unknown> | null | undefined,
): UserRestrictions {
  if (!prefs || typeof prefs !== "object") return EMPTY_RESTRICTIONS;
  const raw = (prefs as { restrictions?: unknown }).restrictions;
  if (!raw || typeof raw !== "object") return EMPTY_RESTRICTIONS;

  const r = raw as Record<string, unknown>;
  const families = Array.isArray(r.families)
    ? (r.families as unknown[])
      .filter((s): s is string => typeof s === "string" && s.length > 0)
      .slice(0, 60)
    : [];

  const ingredients: RestrictedIngredient[] = Array.isArray(r.ingredients)
    ? (r.ingredients as unknown[])
      .map((it): RestrictedIngredient | null => {
        if (!it || typeof it !== "object") return null;
        const obj = it as Record<string, unknown>;
        const slug = typeof obj.slug === "string" ? obj.slug.trim() : "";
        const name = typeof obj.name === "string" ? obj.name.trim() : "";
        if (!slug || !name) return null;
        return { slug, name };
      })
      .filter((x): x is RestrictedIngredient => x !== null)
      .slice(0, 80)
    : [];

  return { families, ingredients };
}

export function hasAnyRestriction(r: UserRestrictions): boolean {
  return r.families.length > 0 || r.ingredients.length > 0;
}

/** Port byte-for-byte de formatRestrictionsForPrompt. */
export function formatRestrictionsForPrompt(
  restrictions: UserRestrictions,
  familyLabels: Map<string, string>,
): string | null {
  if (!hasAnyRestriction(restrictions)) return null;

  const familyNames = restrictions.families
    .map((slug) => familyLabels.get(slug))
    .filter((n): n is string => Boolean(n));
  const ingredientNames = restrictions.ingredients.map((i) => i.name);

  const lines: string[] = [];
  if (familyNames.length > 0) lines.push(`- Familles d'ingrédients à éviter : ${familyNames.join(", ")}`);
  if (ingredientNames.length > 0) lines.push(`- Ingrédients individuels à éviter : ${ingredientNames.join(", ")}`);
  if (lines.length === 0) return null;

  return [
    "RESTRICTIONS DE L'UTILISATEUR (à respecter dans tes recommandations) :",
    ...lines,
    "Signale-lui en clair lorsqu'un produit contient un de ces éléments. Ne propose jamais un produit qui contient l'un d'eux comme alternative.",
  ].join("\n");
}

/** Charge le catalogue des familles d'ingrédients actives (service-role ok aussi via client lié). */
export async function loadIngredientFamilies(sb: SupabaseClient): Promise<IngredientFamily[]> {
  try {
    const { data, error } = await sb
      .schema("cosme_check")
      .from("ingredient_families")
      .select("slug, tag_slug, name, description_simple, sort_order")
      .eq("active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (error || !data) return [];
    return (data as Array<{
      slug: string;
      tag_slug: string | null;
      name: string;
      description_simple: string;
      sort_order: number;
    }>).map((r) => ({
      slug: r.slug,
      tagSlug: r.tag_slug,
      name: r.name,
      descriptionSimple: r.description_simple,
      sortOrder: r.sort_order,
    }));
  } catch {
    return [];
  }
}

export type RestrictionsContext = {
  block: string | null;
  restrictions: UserRestrictions;
  families: IngredientFamily[];
};

/**
 * Charge le profil + les restrictions de l'utilisateur depuis
 * cosme_check.user_profiles.preferences (un seul read). Renvoie le bloc de
 * profil formaté ET le contexte restrictions (bloc + données brutes + familles
 * pour le matching item-level). Fail-closed : tout échec renvoie des valeurs
 * neutres (pas de personnalisation), jamais d'exception.
 */
export async function loadUserContext(
  sb: SupabaseClient,
  userId: string,
): Promise<{ profileBlock: string | null; restrictions: RestrictionsContext }> {
  try {
    const { data } = await sb
      .schema("cosme_check")
      .from("user_profiles")
      .select("preferences")
      .eq("id", userId)
      .maybeSingle();
    const prefs = (data?.preferences ?? null) as Record<string, unknown> | null;

    // Profil peau
    const skin = readSkinProfile(prefs);
    const profileBlock = formatSkinProfileForPrompt(skin);

    // Restrictions
    const restrictions = readUserRestrictions(prefs);
    if (!hasAnyRestriction(restrictions)) {
      return {
        profileBlock,
        restrictions: { block: null, restrictions: EMPTY_RESTRICTIONS, families: [] },
      };
    }
    const families = await loadIngredientFamilies(sb);
    const labels = new Map(families.map((f) => [f.slug, f.name] as const));
    return {
      profileBlock,
      restrictions: {
        block: formatRestrictionsForPrompt(restrictions, labels),
        restrictions,
        families,
      },
    };
  } catch {
    return {
      profileBlock: null,
      restrictions: { block: null, restrictions: EMPTY_RESTRICTIONS, families: [] },
    };
  }
}

// ─── checkRestrictions (port byte-for-byte de lib/restrictions/check.ts) ─────

export type CheckableItem = {
  position: number;
  input: string;
  slug: string | null;
  name: string | null;
  tags: string[] | null;
};

function normaliseInci(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

export function checkRestrictions(
  items: CheckableItem[],
  restrictions: UserRestrictions,
  families: IngredientFamily[],
): RestrictionMatch[] {
  if (!items || items.length === 0) return [];
  if (restrictions.families.length === 0 && restrictions.ingredients.length === 0) return [];

  const restrictedFamilySet = new Set(restrictions.families);
  const tagToFamily = new Map<string, IngredientFamily>();
  for (const fam of families) {
    if (!fam.tagSlug) continue;
    if (!restrictedFamilySet.has(fam.slug)) continue;
    tagToFamily.set(fam.tagSlug, fam);
  }

  const ingredientBySlug = new Map<string, string>();
  const ingredientByName = new Map<string, string>();
  for (const ing of restrictions.ingredients) {
    if (ing.slug) ingredientBySlug.set(ing.slug, ing.name);
    if (ing.name) ingredientByName.set(normaliseInci(ing.name), ing.name);
  }

  const matches: RestrictionMatch[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const inciName = (item.name ?? item.input ?? "").trim();
    const normalised = normaliseInci(inciName);

    if (item.tags && item.tags.length > 0) {
      for (const tag of item.tags) {
        const fam = tagToFamily.get(tag);
        if (!fam) continue;
        const key = `f:${fam.slug}:${item.position}`;
        if (seen.has(key)) continue;
        seen.add(key);
        matches.push({ kind: "family", slug: fam.slug, label: fam.name, position: item.position, inciName });
      }
    }

    const slugHit = item.slug ? ingredientBySlug.get(item.slug) : undefined;
    const nameHit = normalised ? ingredientByName.get(normalised) : undefined;
    const ingredientLabel = slugHit ?? nameHit;
    if (ingredientLabel) {
      const key = `i:${item.slug ?? normalised}:${item.position}`;
      if (!seen.has(key)) {
        seen.add(key);
        matches.push({
          kind: "ingredient",
          slug: item.slug ?? normalised,
          label: ingredientLabel,
          position: item.position,
          inciName,
        });
      }
    }
  }

  return matches.sort((a, b) => a.position - b.position);
}

// ─── generateSynthesis (prompt v11 PERSONNALISÉ) ─────────────────────────────

export type SynthesisInput = {
  enriched: {
    input_raw: string;
    name: string | null;
    color_rating: ColorRating | null;
    primary_function: string | null;
    tags: string[] | null;
    position_idx: number;
    threshold_label?: string | null;
    restriction_reason?: string | null;
  }[];
  counts: Record<string, number>;
  score: number;
  scoreLabel: string;
  observations: { label: string; status: "present" | "absent" | "info" | "warn"; count: number }[];
  productLabel: string | null;
  userId?: string | null;
  profileBlock?: string | null;
  restrictionsBlock?: string | null;
};

const SYNTH_PROMPT_VERSION = 11;

async function makeCacheKey(input: SynthesisInput): Promise<string> {
  const list = input.enriched
    .map((r) =>
      `${(r.name ?? r.input_raw).trim().toUpperCase()}:${r.color_rating ?? "?"}${r.restriction_reason ? `:R(${r.restriction_reason})` : ""}`
    )
    .join("|");
  const productKey = input.productLabel ? `|p=${input.productLabel.toLowerCase()}` : "";
  const profileKey = input.profileBlock
    ? `|prof=${(await sha256Hex(input.profileBlock)).slice(0, 12)}`
    : "";
  const restrictionsKey = input.restrictionsBlock
    ? `|res=${(await sha256Hex(input.restrictionsBlock)).slice(0, 12)}`
    : "";
  const versionKey = `|v=${SYNTH_PROMPT_VERSION}`;
  const hash = (await sha256Hex(list + productKey + profileKey + restrictionsKey + versionKey)).slice(0, 32);
  return `synthesis:${hash}`;
}

function buildPrompt(input: SynthesisInput): { system: string; user: string } {
  const red = input.enriched.filter((r) => r.color_rating === "Rouge");
  const orange = input.enriched.filter((r) => r.color_rating === "Orange");
  const yellow = input.enriched.filter((r) => r.color_rating === "Jaune");
  const green = input.enriched.filter((r) => r.color_rating === "Vert");
  const total =
    (input.counts.Vert ?? 0) + (input.counts.Jaune ?? 0) +
    (input.counts.Orange ?? 0) + (input.counts.Rouge ?? 0);

  const top3 = input.enriched
    .slice()
    .sort((a, b) => a.position_idx - b.position_idx)
    .slice(0, 3)
    .map((r) => `${r.name ?? r.input_raw}${r.primary_function ? ` (${r.primary_function})` : ""}`);

  const greenWithFunction = green
    .filter((r) => r.primary_function && r.name)
    .slice(0, 6)
    .map((r) => `- ${r.name} : ${r.primary_function}`);

  const fmt = (r: SynthesisInput["enriched"][number]) =>
    `- ${r.name ?? r.input_raw} : ${r.primary_function ?? "fonction inconnue"}`
    + `${r.tags && r.tags.length ? ` [tags: ${r.tags.slice(0, 3).join(", ")}]` : ""}`
    + `${r.threshold_label ? ` [position: ${r.threshold_label}]` : ""}`
    + `${r.restriction_reason ? ` [restriction: ${r.restriction_reason}]` : ""}`;

  const restrictedIngredients = input.enriched.filter((r) => r.restriction_reason);
  const hasProfile = Boolean(input.profileBlock);
  const hasRestrictions = Boolean(input.restrictionsBlock);
  const hasMatches = restrictedIngredients.length > 0;

  const baseSystem =
    "Tu écris la synthèse d'une analyse cosmétique INCI pour un consommateur français.\n\n"
    + "TON & STYLE : comme un pote bien informé qui te parle franchement, sans tourner autour du pot. Phrases courtes, vocabulaire simple mais jamais enfantin. Tu peux dire \"franchement\", \"honnêtement\", \"au final\", \"bonne nouvelle\", \"là, attention\", \"tu peux respirer\", \"ya pas de mystère\". Tu utilises \"tu\" et la 2e personne. Pas d'emoji, pas de marketing (\"idéal\", \"généreux\", \"rassurant\", \"agréable\"), pas de description sensorielle (texture, odeur, fini), pas de conseil médical.\n\n"
    + "MISE EN FORME : **gras** UNIQUEMENT pour les noms INCI. Pas de titre, pas de préambule, pas de signature.\n\n"
    + NO_LONG_DASHES_RULE + "\n\n"
    + "RESTRICTIONS : quand une ligne d'ingrédient porte [restriction: X], cet ingrédient est dans les restrictions de l'utilisateur (X est le libellé). DANS la puce concernée, mentionne-le clairement, par exemple en glissant \"(..., dans tes restrictions)\" juste après le nom + rôle. Pas de paragraphe dédié.\n\n"
    + "ROUGES ET ORANGES : pour chaque rouge, fais 1 puce avec un DANGER CONCRET BREF (1 phrase, exemples : \"peut provoquer des bronchospasmes chez l'asthmatique\", \"soupçonné de favoriser des kystes\", \"lié à des cas d'irritation sévère documentés\", \"libère du formaldéhyde, classé cancérigène\"). Pour les oranges :\n"
    + "- 1 à 2 oranges isolés → 1 puce par ingrédient avec un effet concret bref.\n"
    + "- 3 oranges OU plusieurs oranges de la MÊME famille (même tag) → 1 SEULE puce groupée qui les cite tous en **gras** et donne le mécanisme/danger commun en une phrase. Exemple : \"- **Dimethicone**, **Cyclopentasiloxane**, **Cyclomethicone** (trois silicones) : ils donnent l'effet peau lisse à l'application, mais peuvent étouffer la peau et favoriser les points noirs sur la durée.\"\n\n"
    + "JAUNES : 1 à 3 jaunes notables = 1 puce courte chacun. Plus de 3 = regroupés en 1 puce \"À surveiller selon les peaux sensibles : NOM1, NOM2...\".";

  let system = baseSystem;
  if (input.profileBlock) {
    system += `\n\n${input.profileBlock}\n\nQuand un ingrédient touche directement ce profil (peau sèche + alcool dénaturé, peau sensible + parfum chargé, etc.), souligne-le dans la puce concernée et adapte le closing.`;
  }
  if (input.restrictionsBlock) {
    system += `\n\n${input.restrictionsBlock}\n\nC'est la liste de référence pour les ingrédients à signaler comme restreints (voir aussi le flag [restriction: X] sur les lignes d'ingrédients).`;
  }

  const openingRule = (() => {
    if (hasMatches) {
      const first = restrictedIngredients[0];
      const firstName = first.name ?? first.input_raw;
      const firstReason = first.restriction_reason;
      return `Le produit contient au moins un ingrédient des restrictions de l'utilisateur (${firstName} → ${firstReason}). OUVERTURE OBLIGATOIRE : commence par "Pour toi" et signale CE point en premier. Exemple : "Pour toi : ce produit contient **${firstName}** que tu as choisi d'éviter." (adapte la formulation, mais cite l'ingrédient ET sa restriction).`;
    }
    if (hasRestrictions) {
      return `L'utilisateur a défini des restrictions mais AUCUNE ne match dans cette formule. OUVERTURE OBLIGATOIRE : rassure d'entrée. Exemple : "Bonne nouvelle d'entrée : aucune de tes restrictions ici." (varie la formulation).`;
    }
    if (hasProfile) {
      return `L'utilisateur a un profil rempli mais pas de restrictions. OUVERTURE OBLIGATOIRE : pose le contexte personnel en 1 phrase d'accroche reliée à son profil. Exemple : "Pour ta peau sèche et sensible, voici ce qu'il faut savoir." (adapte au profil exact, ne sois pas générique).`;
    }
    return `L'utilisateur n'a renseigné ni profil ni restrictions. OUVERTURE OBLIGATOIRE : un hook factuel et concret sur le type de produit ou son caractère, basé sur les 3 premiers ingrédients. Exemple : "Un déo en spray bien classique." OU "Une formule légère dominée par l'eau et la glycérine." (pas générique, pas marketing).`;
  })();

  const closingRule = (() => {
    if (hasMatches) {
      return `CLOSING (DERNIÈRE PUCE, obligatoire) : recommandation franche personnalisée qui s'appuie sur la/les restriction(s) matchée(s) et sur le profil si présent. Tu PEUX dire "vise plutôt", "à utiliser de temps en temps", "pour toi, ya mieux ailleurs", "à éviter au quotidien", "à toi de voir si tu veux quelque chose de plus sobre". Commence la puce par "- Pour toi" ou "- Au final" ou "- Franchement".`;
    }
    if (hasRestrictions || hasProfile) {
      return `CLOSING (DERNIÈRE PUCE, obligatoire) : recommandation douce personnalisée qui relie le verdict de la formule au profil/restrictions de l'utilisateur. Tu PEUX dire "pour toi", "vise plutôt", "à toi de voir", "au final pour ton profil". Commence par "- Pour toi" ou "- Au final".`;
    }
    return `CLOSING (DERNIÈRE PUCE, obligatoire) : 1 phrase de prise de recul factuelle SUIVIE d'un soft nudge à compléter le profil. Exemple : "- Au final, c'est un anti-transpirant efficace mais chargé en parfum. Tu peux remplir ton profil ou tes restrictions dans l'app si tu veux qu'on te dise précisément si ce produit te va."`;
  })();

  const user = `Rédige la synthèse de l'analyse INCI ci-dessous en suivant la STRUCTURE imposée.

CONTEXTE :
- Profil utilisateur : ${hasProfile ? "REMPLI (voir bloc dans le system prompt)" : "VIDE"}
- Restrictions utilisateur : ${hasRestrictions ? "DÉFINIES (voir bloc dans le system prompt)" : "AUCUNE"}
- Ingrédients de cette formule en restriction : ${hasMatches ? restrictedIngredients.map((r) => `${r.name ?? r.input_raw} (${r.restriction_reason})`).join(", ") : "AUCUN"}

STRUCTURE OBLIGATOIRE (deux blocs séparés par une ligne vide) :

BLOC 1 (prose, 2 à 3 phrases, pas de puce) :
- Phrase 1 (OUVERTURE) — règle :
  ${openingRule}
- Phrase 2 (CONSTAT CHIFFRÉ, naturel) : ${total === 0 ? "Aucun ingrédient n'a pu être reconnu dans la liste fournie. Dis-le simplement, sans utiliser de chiffres comme \"0 sur 0\" ou \"0 ingrédient\". Exemple : \"Aucun ingrédient de cette liste n'est dans notre base, difficile d'aller plus loin.\" ou \"La formule n'a pas pu être lue, les ingrédients sont peut-être mal orthographiés ou trop fragmentés.\" (adapte selon le contexte)." : `"Sur les ${total} ingrédients identifiés, ${input.counts.Vert ?? 0} sont sans risque connu et ${(input.counts.Jaune ?? 0) + (input.counts.Orange ?? 0) + (input.counts.Rouge ?? 0)} méritent un coup d'œil." (varie la formulation, garde les chiffres).`}
- Phrase 3 (TRANSITION, courte) : "Voici ce qui mérite ton attention :" ou similaire.
- ANTI-DOUBLON : ne cite jamais deux fois le même ingrédient dans le bloc 1. Si tu utilises la traduction française ("l'eau", "le beurre de karité"), n'ajoute pas le nom INCI entre parenthèses. Choisis UNE formulation par ingrédient.

BLOC 2 (puces, chaque ligne commence par "- ", 4 à 7 puces max) :

1. ROUGES : 1 puce par ingrédient rouge, avec un DANGER CONCRET BREF. Format :
"- **NOM** (famille + rôle simple${hasMatches ? ", et si flag [restriction], ajouter \", dans tes restrictions\"" : ""}) : danger concret en 1 phrase. Position en fin de phrase si dispo."

2. ORANGES : applique la règle de groupage du system prompt :
- 1 à 2 oranges isolés (familles différentes) → 1 puce par ingrédient avec effet concret bref.
- 3 oranges OU plusieurs de la même famille (même tag dans [tags: ...]) → 1 puce groupée.

3. JAUNES :
- 1 à 3 jaunes notables → 1 puce courte chacun.
- Plus de 3 → 1 puce groupée "À surveiller selon les peaux sensibles : **NOM1**, **NOM2**, **NOM3**...".

4. BONUS optionnel (max 1) :
- "Bon à savoir" sur UN VERT notable (Niacinamide, Acide Hyaluronique, Panthénol, Centella Asiatica). Ignore eau / glycérine / propanediol / sodium hydroxide / pH ajusteurs.
- INTERDIT : ne jamais énumérer ce qui est absent (style "Sans parabens, sans sulfates..."). Cette information est déjà affichée dans le panneau Observations, la répéter ici alourdit la synthèse.

5. CLOSING (DERNIÈRE PUCE, obligatoire) — règle :
   ${closingRule}

CONTRAINTES STRICTES :
- Total puces (bloc 2) : 4 à 7 max, closing comprise.
- Chaque puce : 1 à 2 phrases courtes. Pas de pavé.
- Pas de jargon médical (dermatite, eczéma, comédogène, sébo-régulateur). Préfère "peut irriter", "peut boucher les pores".
- INTERDIT absolu : les verbes "soigne", "traite", "guérit", "cicatrise", "régénère", "répare", "restaure" — réservés aux médicaments (Règlement CE 1223/2009). Utilise à la place : "entretient la peau", "maintient en bon état", "hydrate", "adoucit", "protège", "reconstitue".
- Pas d'emoji, pas d'astérisque autre que les **gras INCI**.
- AUCUN tiret cadratin (—) ni demi-cadratin (–). Utilise virgule, deux-points ou nouvelle phrase.
- VARIE l'attaque du bloc 1 d'une analyse à l'autre.
- Si tu cites le danger concret d'un rouge/orange, reste sobre et factuel : pas de catastrophisme, pas d'invention. Si tu n'as aucune raison documentée, dis-le platement ("controversé sans consensus clair").

DONNÉES :
${input.productLabel ? `Produit : ${input.productLabel}` : "Produit : liste collée par l'utilisateur, pas de nom de produit fourni."}
Note : ${input.score.toFixed(1)}/20 (${input.scoreLabel})
Comptes : Vert=${input.counts.Vert ?? 0}, Jaune=${input.counts.Jaune ?? 0}, Orange=${input.counts.Orange ?? 0}, Rouge=${input.counts.Rouge ?? 0}, total reconnu=${total}.

3 premiers ingrédients (utilisés pour caractériser la formule si tu rédiges un hook produit) :
${top3.length ? top3.map((t, i) => `${i + 1}. ${t}`).join("\n") : "(non disponible)"}

ROUGES :
${red.length ? red.map(fmt).join("\n") : "(aucun)"}

ORANGE :
${orange.length ? orange.map(fmt).join("\n") : "(aucun)"}

JAUNES (jusqu'à 8 cités) :
${yellow.length ? yellow.slice(0, 8).map(fmt).join("\n") + (yellow.length > 8 ? `\n- et ${yellow.length - 8} autres` : "") : "(aucun)"}

VERTS notables (utilise UN seul pour la puce "Bon à savoir" si pertinent) :
${greenWithFunction.length ? greenWithFunction.join("\n") : "(aucun avec fonction connue)"}

Écris maintenant la synthèse en suivant la structure (Bloc 1 prose, ligne vide, Bloc 2 puces). Pas de titre, pas de préambule, pas de signature.`;

  return { system, user };
}

/**
 * Fallback Mistral (port byte-for-byte de callMistralFallback côté web).
 * Renvoie null si Mistral indisponible OU si l'appel échoue silencieusement.
 */
async function callMistralFallback(input: SynthesisInput): Promise<string | null> {
  if (!hasMistral()) return null;
  const { system, user } = buildPrompt(input);
  try {
    const raw = await mistralChat({
      model: MISTRAL_MODEL,
      temperature: 0.55,
      maxTokens: 900,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    return raw?.trim() ?? null;
  } catch {
    return null;
  }
}

export async function generateSynthesis(input: SynthesisInput): Promise<string | null> {
  const cacheKey = await makeCacheKey(input);
  const cached = await getCached<{ text: string }>(cacheKey);
  if (cached?.text) return cached.text;

  // Aucun provider IA → null gracieux (parité web).
  if (!hasOpenAI() && !hasMistral()) return null;

  const { system, user } = buildPrompt(input);

  try {
    // Ordre provider IDENTIQUE au web : OpenAI primaire, Mistral fallback.
    // callWithFallback applique le timeout 25 s sur le primaire et la même
    // sémantique de logAI (success / fallback / error) que lib/ai/client.ts.
    const text = await callWithFallback<string | null>({
      feature: "synthesis",
      userId: input.userId ?? null,
      timeoutMs: 25_000,
      primary: async () => {
        if (!hasOpenAI()) throw new Error("openai disabled");
        const resp = await openai().chat.completions.create({
          model: AI_MODEL,
          temperature: 0.55,
          top_p: 0.95,
          max_tokens: 900,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        });
        const raw = resp.choices?.[0]?.message?.content?.trim() ?? null;
        const value = raw ? stripLongDashes(raw) : null;
        return {
          value,
          tokensIn: resp.usage?.prompt_tokens,
          tokensOut: resp.usage?.completion_tokens,
        };
      },
      fallback: async () => {
        const raw = await callMistralFallback(input);
        return {
          value: raw ? stripLongDashes(raw) : null,
          provider: "mistral" as const,
        };
      },
    });

    if (text) void setCached(cacheKey, { text });
    return text;
  } catch {
    return null;
  }
}

// ─── stripAbsencesParagraph (port byte-for-byte de _shared/sanitize web) ─────
// Note: la version Edge de _shared/sanitize.ts l'expose déjà ; on la ré-importe
// dans index.ts depuis _shared.
