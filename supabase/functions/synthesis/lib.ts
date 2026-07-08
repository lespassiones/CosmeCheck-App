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
import { stripLongDashes } from "../_shared/sanitize.ts";
import { buildPrompt, SYNTH_PROMPT_VERSION, type SynthesisInput } from "./prompt.ts";

// buildPrompt / SynthesisInput / SYNTH_PROMPT_VERSION vivent dans prompt.ts
// (pur, sans dépendance Deno) pour être testables en Jest. On les ré-exporte
// pour que index.ts (et les imports historiques) restent inchangés.
export { buildPrompt, SYNTH_PROMPT_VERSION } from "./prompt.ts";
export type { ColorRating, SynthesisInput } from "./prompt.ts";

const MISTRAL_MODEL = "mistral-small-latest";

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

// ─── generateSynthesis (prompt PERSONNALISÉ) ─────────────────────────────────
// Le type SynthesisInput, la constante SYNTH_PROMPT_VERSION et buildPrompt sont
// définis dans ./prompt.ts (logique pure, testable Jest) et importés en tête.

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
