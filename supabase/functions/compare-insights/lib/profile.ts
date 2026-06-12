/**
 * Copie locale de coherence-analyze/lib/profile.ts — les Edge Functions
 * ne peuvent pas importer entre leurs répertoires respectifs.
 *
 * Lit cosme_check.user_profiles.preferences (jsonb) et rend deux blocs de
 * prompt : profil peau et restrictions d'ingrédients. Fail-closed (null, null)
 * sur toute erreur — ne bloque jamais le pipeline compare.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

type Prefs = Record<string, unknown> | null;

function readShort(r: Record<string, unknown>, key: string, max: number): string | null {
  const v = r[key];
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t.slice(0, max) : null;
}

function strArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((s): s is string => typeof s === "string" && s.trim().length > 0);
}

function formatSkinProfile(prefs: Prefs): string | null {
  if (!prefs || typeof prefs !== "object") return null;
  const raw = (prefs as { skin?: unknown }).skin;
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const lines: string[] = [];

  const faceParts: string[] = [];
  if (typeof r.skinTypeFace === "string" && r.skinTypeFace) faceParts.push(r.skinTypeFace);
  const otherFace = readShort(r, "otherSkinTypeFace", 120);
  if (otherFace) faceParts.push(`précision : ${otherFace}`);
  if (faceParts.length > 0) lines.push(`- Type de peau visage : ${faceParts.join(" — ")}`);

  const bodyParts: string[] = [];
  const bodyType =
    (typeof r.skinTypeBody === "string" && r.skinTypeBody) ||
    (typeof r.skinType === "string" && r.skinType) ||
    "";
  if (bodyType) bodyParts.push(bodyType);
  const otherBody = readShort(r, "otherSkinTypeBody", 120) ?? readShort(r, "otherSkinType", 120);
  if (otherBody) bodyParts.push(`précision : ${otherBody}`);
  if (bodyParts.length > 0) lines.push(`- Type de peau corps : ${bodyParts.join(" — ")}`);

  const concernParts: string[] = [];
  const concerns = strArray(r.concerns);
  if (concerns.length > 0) concernParts.push(concerns.join(", "));
  const otherConcerns = readShort(r, "otherConcerns", 300);
  if (otherConcerns) concernParts.push(otherConcerns);
  if (concernParts.length > 0) lines.push(`- Préoccupations : ${concernParts.join(" ; ")}`);

  const hairParts: string[] = [];
  const hair = strArray(r.hairConcerns);
  if (hair.length > 0) hairParts.push(hair.join(", "));
  const otherHair = readShort(r, "otherHair", 200);
  if (otherHair) hairParts.push(otherHair);
  if (hairParts.length > 0) lines.push(`- Cheveux : ${hairParts.join(" ; ")}`);

  const allergies = readShort(r, "allergiesFreeform", 500);
  if (allergies) lines.push(`- Allergies / intolérances : ${allergies}`);

  const notes = readShort(r, "otherNotes", 500);
  if (notes) lines.push(`- Autres précisions : ${notes}`);

  if (lines.length === 0) return null;

  return [
    "PROFIL DE L'UTILISATEUR (à prendre en compte pour personnaliser ta réponse) :",
    ...lines,
    "Adapte tes recommandations à ce profil. Cite les éléments du profil quand c'est pertinent (ex : « pour une peau sèche, … »).",
  ].join("\n");
}

function formatRestrictions(
  prefs: Prefs,
  familyLabels: Map<string, string>,
): string | null {
  if (!prefs || typeof prefs !== "object") return null;
  const raw = (prefs as { restrictions?: unknown }).restrictions;
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const familySlugs = strArray(r.families).slice(0, 60);
  const ingredientNames: string[] = Array.isArray(r.ingredients)
    ? (r.ingredients as unknown[])
        .map((it) => {
          if (!it || typeof it !== "object") return null;
          const o = it as Record<string, unknown>;
          return typeof o.name === "string" && o.name.trim() ? o.name.trim() : null;
        })
        .filter((x): x is string => x !== null)
        .slice(0, 80)
    : [];

  const familyNames = familySlugs
    .map((slug) => familyLabels.get(slug) ?? null)
    .filter((n): n is string => Boolean(n));

  const lines: string[] = [];
  if (familyNames.length > 0) {
    lines.push(`- Familles d'ingrédients à éviter : ${familyNames.join(", ")}`);
  }
  if (ingredientNames.length > 0) {
    lines.push(`- Ingrédients individuels à éviter : ${ingredientNames.join(", ")}`);
  }
  if (lines.length === 0) return null;

  return [
    "RESTRICTIONS DE L'UTILISATEUR (à respecter dans tes recommandations) :",
    ...lines,
    "Signale-lui en clair lorsqu'un produit contient un de ces éléments. Ne propose jamais un produit qui contient l'un d'eux comme alternative.",
  ].join("\n");
}

export async function loadProfileAndRestrictions(
  sb: SupabaseClient,
  userId: string,
): Promise<{ profileBlock: string | null; restrictionsBlock: string | null }> {
  try {
    const { data } = await sb
      .schema("cosme_check")
      .from("user_profiles")
      .select("preferences")
      .eq("id", userId)
      .maybeSingle();
    const prefs = (data?.preferences ?? null) as Prefs;
    if (!prefs) return { profileBlock: null, restrictionsBlock: null };

    const profileBlock = formatSkinProfile(prefs);

    let restrictionsBlock: string | null = null;
    const rawRestr = (prefs as { restrictions?: unknown }).restrictions;
    const familySlugs =
      rawRestr && typeof rawRestr === "object"
        ? strArray((rawRestr as Record<string, unknown>).families)
        : [];
    let familyLabels = new Map<string, string>();
    if (familySlugs.length > 0) {
      try {
        const { data: fams } = await sb
          .schema("cosme_check")
          .from("ingredient_families")
          .select("slug, name")
          .eq("active", true);
        familyLabels = new Map(
          ((fams ?? []) as { slug: string; name: string }[]).map((f) => [f.slug, f.name]),
        );
      } catch {
        familyLabels = new Map();
      }
    }
    restrictionsBlock = formatRestrictions(prefs, familyLabels);

    return { profileBlock, restrictionsBlock };
  } catch {
    return { profileBlock: null, restrictionsBlock: null };
  }
}
