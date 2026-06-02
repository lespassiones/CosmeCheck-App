/**
 * Personnalisation de la synthèse (Deno) — ports de :
 *   - CosmetWiki/lib/skin/profile.ts          → readSkinProfile, labels
 *   - CosmetWiki/lib/skin/promptFormat.ts     → formatSkinProfileForPrompt / loadProfileForPrompt
 *   - CosmetWiki/lib/restrictions/types.ts    → readUserRestrictions, hasAnyRestriction
 *   - CosmetWiki/lib/restrictions/families.ts → loadIngredientFamilies
 *   - CosmetWiki/lib/restrictions/promptFormat.ts → loadRestrictionsContext
 *   - CosmetWiki/lib/restrictions/check.ts    → checkRestrictions
 *
 * Le web charge le profil via le client lié au user (RLS). Ici on reçoit ce
 * client (sbAuth) en paramètre pour préserver la même sémantique. Tout
 * dégrade en "pas de personnalisation" (null / vide) en cas d'erreur — jamais
 * de throw, comme le web (`loadProfileForPrompt` fail-closed).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

// ─── Skin profile labels (port verbatim) ────────────────────────────────────
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
type SkinConcern =
  | typeof SKIN_CONCERNS[number]
  | "anti-age" | "cuir_chevelu" | "cheveux";

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

type SkinProfile = {
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

function readSkinProfile(prefs: Record<string, unknown> | null | undefined): SkinProfile {
  if (!prefs || typeof prefs !== "object") return {};
  const raw = (prefs as { skin?: unknown }).skin;
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;

  const rawConcerns: SkinConcern[] = Array.isArray(r.concerns)
    ? (r.concerns as unknown[]).filter(
      (c): c is SkinConcern =>
        SKIN_CONCERNS.includes(c as (typeof SKIN_CONCERNS)[number]) ||
        c === "anti-age" || c === "cuir_chevelu" || c === "cheveux",
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

function formatSkinProfileForPrompt(skin: SkinProfile): string | null {
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

export async function loadProfileForPrompt(
  sb: SupabaseClient,
  userId: string,
): Promise<string | null> {
  try {
    const { data } = await sb
      .schema("cosme_check")
      .from("user_profiles")
      .select("preferences")
      .eq("id", userId)
      .maybeSingle();
    const prefs = (data?.preferences ?? null) as Record<string, unknown> | null;
    const skin = readSkinProfile(prefs);
    return formatSkinProfileForPrompt(skin);
  } catch {
    return null;
  }
}

// ─── Restrictions (port verbatim) ────────────────────────────────────────────
export type RestrictedIngredient = { slug: string; name: string };
export type UserRestrictions = { families: string[]; ingredients: RestrictedIngredient[] };
const EMPTY_RESTRICTIONS: UserRestrictions = { families: [], ingredients: [] };

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

function readUserRestrictions(prefs: Record<string, unknown> | null | undefined): UserRestrictions {
  if (!prefs || typeof prefs !== "object") return EMPTY_RESTRICTIONS;
  const raw = (prefs as { restrictions?: unknown }).restrictions;
  if (!raw || typeof raw !== "object") return EMPTY_RESTRICTIONS;
  const r = raw as Record<string, unknown>;
  const families = Array.isArray(r.families)
    ? (r.families as unknown[]).filter((s): s is string => typeof s === "string" && s.length > 0).slice(0, 60)
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

function hasAnyRestriction(r: UserRestrictions): boolean {
  return r.families.length > 0 || r.ingredients.length > 0;
}

function formatRestrictionsForPrompt(
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

export type RestrictionsContext = {
  block: string | null;
  restrictions: UserRestrictions;
  families: IngredientFamily[];
};

async function loadIngredientFamilies(sb: SupabaseClient): Promise<IngredientFamily[]> {
  type RawRow = {
    slug: string;
    tag_slug: string | null;
    name: string;
    description_simple: string;
    sort_order: number;
  };
  const { data, error } = await sb
    .schema("cosme_check")
    .from("ingredient_families")
    .select("slug, tag_slug, name, description_simple, sort_order")
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error || !data) return [];
  return (data as RawRow[]).map((r) => ({
    slug: r.slug,
    tagSlug: r.tag_slug,
    name: r.name,
    descriptionSimple: r.description_simple,
    sortOrder: r.sort_order,
  }));
}

export async function loadRestrictionsContext(
  sb: SupabaseClient,
  userId: string,
): Promise<RestrictionsContext> {
  try {
    const { data } = await sb
      .schema("cosme_check")
      .from("user_profiles")
      .select("preferences")
      .eq("id", userId)
      .maybeSingle();
    const prefs = (data?.preferences ?? null) as Record<string, unknown> | null;
    const restrictions = readUserRestrictions(prefs);
    if (!hasAnyRestriction(restrictions)) {
      return { block: null, restrictions: EMPTY_RESTRICTIONS, families: [] };
    }
    const families = await loadIngredientFamilies(sb);
    const labels = new Map(families.map((f) => [f.slug, f.name] as const));
    return { block: formatRestrictionsForPrompt(restrictions, labels), restrictions, families };
  } catch {
    return { block: null, restrictions: EMPTY_RESTRICTIONS, families: [] };
  }
}

// ─── checkRestrictions (port verbatim) ──────────────────────────────────────
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
