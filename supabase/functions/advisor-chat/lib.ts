/**
 * Helpers spécifiques à la fonction `advisor-chat`. Port autonome (Deno) des
 * libs web `lib/skin/profile.ts` (sous-ensemble), `lib/restrictions/types.ts`
 * et `lib/restrictions/families.ts` utilisés par la route
 * `app/api/advisor/chat/route.ts`.
 *
 * On garde tout dans le dossier de la fonction (pas d'ajout à _shared pour
 * éviter les collisions). Le profil est lu depuis
 * cosme_check.user_profiles.preferences (jsonb), clé `skin` ; les restrictions
 * sous la clé `restrictions`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

// ─── Skin profile (sous-ensemble nécessaire au prompt advisor) ──────────────

export const SKIN_TYPE_FACE_LABEL: Record<string, string> = {
  seche: "Sèche",
  mixte: "Mixte",
  grasse: "Grasse",
  sensible: "Sensible",
  normale: "Normale",
};

export const SKIN_TYPES_FACE = ["seche", "mixte", "grasse", "sensible", "normale"];

export const SKIN_TYPE_BODY_LABEL: Record<string, string> = {
  seche: "Sèche",
  tres_seche: "Très sèche / atopique",
  normale: "Normale",
  sensible: "Sensible / réactive",
  mixte: "Mixte (zones sèches et grasses)",
};

export const SKIN_TYPES_BODY = ["seche", "tres_seche", "normale", "sensible", "mixte"];

export const SKIN_CONCERN_LABEL: Record<string, string> = {
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

const SKIN_CONCERNS = [
  "acne", "rides", "taches", "secheresse", "rougeurs", "sensibilite",
  "pores_dilates", "exces_sebum", "cernes_poches", "vergetures_cellulite",
];

// Objectifs (souhaits) — mirror de lib/skin/profile.ts:PROFILE_GOAL_LABEL.
export const GOAL_LABEL: Record<string, string> = {
  peau_douce: "Avoir une peau plus douce",
  teint_uniforme: "Uniformiser mon teint",
  attenuer_boutons: "Atténuer mes boutons",
  reduire_rides: "Réduire mes rides et ridules",
  calmer_rougeurs: "Calmer mes rougeurs",
  hydrater_profondeur: "Hydrater ma peau en profondeur",
  reduire_taches: "Réduire mes taches",
  renforcer_barriere: "Renforcer ma peau face aux agressions",
  adoucir_corps: "Adoucir ma peau du corps",
  reduire_vergetures: "Réduire l'apparence des vergetures",
  proteger_soleil: "Mieux protéger ma peau du soleil",
  cheveux_brillants: "Avoir des cheveux plus brillants",
  renforcer_cheveux: "Renforcer mes cheveux abîmés",
  definir_boucles: "Définir mes boucles",
  cuir_chevelu_sain: "Avoir un cuir chevelu sain",
  reduire_chute: "Réduire la chute / casse",
  simplifier_routine: "Simplifier ma routine quotidienne",
  decouvrir_clean: "Découvrir des produits plus clean",
  comprendre_produits: "Mieux comprendre mes produits",
  eviter_risques: "Éviter les ingrédients risqués",
  alternatives_adaptees: "Trouver des alternatives adaptées",
  construire_routine: "Construire / améliorer ma routine",
};

export type SkinProfile = {
  skinTypeFace?: string;
  otherSkinTypeFace?: string;
  skinTypeBody?: string;
  otherSkinTypeBody?: string;
  concerns?: string[];
  allergiesFreeform?: string;
  goals?: string[];
  otherGoals?: string;
};

/**
 * Lit `preferences.skin` et reconstruit le sous-ensemble du profil dont le
 * prompt advisor a besoin (type peau visage/corps, préoccupations, allergies).
 * Mirror simplifié de `readSkinProfile` côté web : migre les valeurs legacy
 * (anti-age → rides, skinType → corps) pour rester cohérent.
 */
export function readSkinProfile(prefs: Record<string, unknown> | null | undefined): SkinProfile {
  if (!prefs || typeof prefs !== "object") return {};
  const raw = (prefs as { skin?: unknown }).skin;
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;

  const rawConcerns: string[] = Array.isArray(r.concerns)
    ? (r.concerns as unknown[]).filter(
        (c): c is string =>
          typeof c === "string"
          && (SKIN_CONCERNS.includes(c) || c === "anti-age" || c === "cuir_chevelu" || c === "cheveux"),
      )
    : [];
  const cleanedConcerns = rawConcerns
    .filter((c) => c !== "cuir_chevelu" && c !== "cheveux")
    .map((c) => (c === "anti-age" ? "rides" : c));

  const readShort = (key: string, max: number): string | undefined => {
    const v = r[key];
    if (typeof v !== "string") return undefined;
    const trimmed = v.trim();
    return trimmed.length > 0 ? trimmed.slice(0, max) : undefined;
  };

  const skinTypeFace = SKIN_TYPES_FACE.includes(r.skinTypeFace as string)
    ? (r.skinTypeFace as string)
    : undefined;
  const newBody = SKIN_TYPES_BODY.includes(r.skinTypeBody as string)
    ? (r.skinTypeBody as string)
    : undefined;
  const legacyBody = SKIN_TYPES_BODY.includes(r.skinType as string)
    ? (r.skinType as string)
    : undefined;

  const goals = Array.isArray(r.goals)
    ? (r.goals as unknown[]).filter((g): g is string => typeof g === "string" && g.length > 0)
    : [];

  return {
    skinTypeFace,
    otherSkinTypeFace: readShort("otherSkinTypeFace", 120),
    skinTypeBody: newBody ?? legacyBody,
    otherSkinTypeBody: readShort("otherSkinTypeBody", 120) ?? readShort("otherSkinType", 120),
    concerns: cleanedConcerns.length > 0 ? cleanedConcerns : undefined,
    allergiesFreeform: readShort("allergiesFreeform", 500),
    goals: goals.length > 0 ? goals : undefined,
    otherGoals: readShort("otherGoals", 300),
  };
}

// ─── Restrictions ───────────────────────────────────────────────────────────

export type RestrictedIngredient = { slug: string; name: string };
export type UserRestrictions = { families: string[]; ingredients: RestrictedIngredient[] };

export function readUserRestrictions(
  prefs: Record<string, unknown> | null | undefined,
): UserRestrictions {
  if (!prefs || typeof prefs !== "object") return { families: [], ingredients: [] };
  const raw = (prefs as { restrictions?: unknown }).restrictions;
  if (!raw || typeof raw !== "object") return { families: [], ingredients: [] };
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

/**
 * Charge la table cosme_check.ingredient_families (lignes actives) et renvoie
 * une Map slug -> nom. Best-effort : renvoie une Map vide en cas d'erreur.
 */
export async function loadFamilyLabels(sb: SupabaseClient): Promise<Map<string, string>> {
  try {
    const { data, error } = await sb
      .schema("cosme_check")
      .from("ingredient_families")
      .select("slug, name")
      .eq("active", true);
    if (error || !data) return new Map();
    return new Map(
      (data as { slug: string; name: string }[]).map((f) => [f.slug, f.name] as const),
    );
  } catch {
    return new Map();
  }
}
