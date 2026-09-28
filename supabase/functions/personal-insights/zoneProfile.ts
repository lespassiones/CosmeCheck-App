/**
 * personal-insights/zoneProfile.ts : PROFIL LIMITÉ À LA ZONE DU PRODUIT (pur).
 *
 * Avant (bêta sept 2026) le LLM recevait TOUT le profil (visage + corps +
 * cheveux) et devait « balayer chaque élément » : sur une crème capillaire il
 * trouvait « peau grasse » et pénalisait l'huile de coco. On ne lui envoie plus
 * que ce qui concerne la zone du produit (+ ce qui vaut partout : allergies,
 * objectifs généraux, précisions libres).
 *
 * Deux entrées :
 *   - `buildZoneProfileBlock(skin, ctx)` : depuis le profil STRUCTURÉ (personal-insights) ;
 *   - `filterProfileBlockForZone(block, ctx)` : depuis le bloc TEXTE déjà formaté
 *     par `formatSkinProfileForPrompt` (synthèse, qui n'a que la chaîne).
 *
 * Les libellés sont une COPIE de ceux de `synthesis/lib.ts` (non importable en
 * Jest : dépendances Deno). Une dérive ne ferait que changer un libellé affiché
 * au LLM, jamais le filtrage (fait sur les clés).
 */
import { BODY_GROUP, FACE_GROUP, type ProductAxis, type ZoneContextLike, zonesOf } from "./productContext.ts";
import type { SkinProfileLike } from "./relevance.ts";

const SKIN_TYPE_FACE_LABEL: Record<string, string> = {
  seche: "Sèche",
  mixte: "Mixte",
  grasse: "Grasse",
  sensible: "Sensible",
  normale: "Normale",
};
const SKIN_TYPE_BODY_LABEL: Record<string, string> = {
  seche: "Sèche",
  tres_seche: "Très sèche / atopique",
  normale: "Normale",
  sensible: "Sensible / réactive",
  mixte: "Mixte (zones sèches et grasses)",
};
const SKIN_CONCERN_LABEL: Record<string, string> = {
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
};
const HAIR_CONCERN_LABEL: Record<string, string> = {
  secs: "Secs",
  gras: "Gras",
  cuir_chevelu_sensible: "Cuir chevelu sensible / affecté",
  chute: "Chute de cheveux",
  pellicules: "Pellicules",
  ternes_cassants: "Cheveux ternes / cassants",
};
const PROFILE_GOAL_LABEL: Record<string, string> = {
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

// ── Zone de chaque élément du profil ─────────────────────────────────────────
type ProfileZone = "face" | "body" | "skin" | "hair" | "all";

/** Préoccupations : visage, corps, ou peau en général (les deux). Inconnue = peau. */
const CONCERN_ZONE: Record<string, ProfileZone> = {
  acne: "face", rides: "face", taches: "face", pores_dilates: "face", exces_sebum: "face",
  cernes_poches: "face", rougeurs: "face", points_noirs: "face", imperfections: "face",
  boutons: "face", brillance: "face", couperose: "face", rosacee: "face",
  vergetures_cellulite: "body",
  secheresse: "skin", sensibilite: "skin", eczema: "skin", dermatite: "skin", reactivite: "skin",
};
/** Objectifs : par zone ; les objectifs « méta » valent partout. Inconnu = partout. */
const GOAL_ZONE: Record<string, ProfileZone> = {
  teint_uniforme: "face", attenuer_boutons: "face", reduire_rides: "face", calmer_rougeurs: "face",
  reduire_taches: "face", reduire_imperfections: "face", matifier: "face",
  adoucir_corps: "body", reduire_vergetures: "body",
  peau_douce: "skin", hydrater_profondeur: "skin", renforcer_barriere: "skin", proteger_soleil: "skin",
  cheveux_brillants: "hair", renforcer_cheveux: "hair", definir_boucles: "hair",
  cuir_chevelu_sain: "hair", reduire_chute: "hair",
};

type Scope = { face: boolean; body: boolean; hair: boolean };

function scopeOf(ctx: ZoneContextLike): Scope {
  const zones = zonesOf(ctx);
  // Zone inconnue ("none") : pas de filtrage (comportement historique).
  if (zones.includes("none")) return { face: true, body: true, hair: true };
  const has = (group: readonly ProductAxis[]) => zones.some((z) => group.includes(z));
  return { face: has(FACE_GROUP), body: has(BODY_GROUP), hair: zones.includes("hair") };
}

function inScope(zone: ProfileZone | undefined, s: Scope): boolean {
  switch (zone) {
    case "face": return s.face;
    case "body": return s.body;
    case "skin": return s.face || s.body;
    case "hair": return s.hair;
    default: return true;
  }
}

const ZONE_TITLE: Record<ProductAxis, string> = {
  hair: "cheveux et cuir chevelu", face: "visage", body: "corps", lips: "lèvres",
  eyes: "contour des yeux", hands: "mains", feet: "pieds", oral: "bouche et dents",
  underarm: "aisselles", nails: "ongles", none: "toutes zones",
};

/**
 * Bloc profil LIMITÉ à la zone du produit, depuis le profil structuré.
 * Renvoie null si AUCUN élément du profil ne concerne cette zone.
 */
export function buildZoneProfileBlock(
  skin: SkinProfileLike & { otherNotes?: string },
  ctx: ZoneContextLike,
): string | null {
  const s = scopeOf(ctx);
  const skinScope = s.face || s.body;
  const lines: string[] = [];

  if (s.face) {
    const parts: string[] = [];
    if (skin.skinTypeFace) parts.push(SKIN_TYPE_FACE_LABEL[skin.skinTypeFace] ?? skin.skinTypeFace);
    if (skin.otherSkinTypeFace) parts.push(`précision : ${skin.otherSkinTypeFace}`);
    if (parts.length) lines.push(`- Type de peau visage : ${parts.join(" ; ")}`);
  }
  if (s.body) {
    const parts: string[] = [];
    if (skin.skinTypeBody) parts.push(SKIN_TYPE_BODY_LABEL[skin.skinTypeBody] ?? skin.skinTypeBody);
    if (skin.otherSkinTypeBody) parts.push(`précision : ${skin.otherSkinTypeBody}`);
    if (parts.length) lines.push(`- Type de peau corps : ${parts.join(" ; ")}`);
  }
  if (skinScope) {
    const concerns = (skin.concerns ?? [])
      .filter((c) => inScope(CONCERN_ZONE[c] ?? "skin", s))
      .map((c) => SKIN_CONCERN_LABEL[c] ?? c);
    const parts = concerns.length ? [concerns.join(", ")] : [];
    if (skin.otherConcerns) parts.push(skin.otherConcerns);
    if (parts.length) lines.push(`- Préoccupations peau : ${parts.join(" ; ")}`);
  }
  if (s.hair) {
    const parts: string[] = [];
    if (skin.hairConcerns?.length) parts.push(skin.hairConcerns.map((h) => HAIR_CONCERN_LABEL[h] ?? h).join(", "));
    if (skin.otherHair) parts.push(skin.otherHair);
    if (skin.otherHairConcerns) parts.push(skin.otherHairConcerns);
    if (parts.length) lines.push(`- Cheveux et cuir chevelu : ${parts.join(" ; ")}`);
  }
  {
    const goals = (skin.goals ?? [])
      .filter((g) => inScope(GOAL_ZONE[g] ?? "all", s))
      .map((g) => PROFILE_GOAL_LABEL[g] ?? g);
    const parts = goals.length ? [goals.join(", ")] : [];
    if (skin.otherGoals) parts.push(skin.otherGoals);
    if (s.face && skin.otherGoalsFace) parts.push(skin.otherGoalsFace);
    if (s.body && skin.otherGoalsBody) parts.push(skin.otherGoalsBody);
    if (s.hair && skin.otherGoalsHair) parts.push(skin.otherGoalsHair);
    if (skin.otherGoalsRoutine) parts.push(skin.otherGoalsRoutine);
    if (parts.length) lines.push(`- Objectifs : ${parts.join(" ; ")}`);
  }
  if (skin.allergiesFreeform) lines.push(`- Allergies / intolérances : ${skin.allergiesFreeform}`);
  if (skin.otherNotes) lines.push(`- Autres précisions : ${skin.otherNotes}`);

  if (lines.length === 0) return null;
  const zoneTitle = zonesOf(ctx).map((z) => ZONE_TITLE[z]).join(" + ");
  return [`PROFIL DE L'UTILISATEUR, LIMITÉ À LA ZONE DU PRODUIT (${zoneTitle}) :`, ...lines].join("\n");
}

// ── Filtre du bloc TEXTE (synthèse) ──────────────────────────────────────────
const labelZone = (map: Record<string, string>, zoneOf: Record<string, ProfileZone>, fallback: ProfileZone) => {
  const out = new Map<string, ProfileZone>();
  for (const [key, label] of Object.entries(map)) out.set(label.toLowerCase(), zoneOf[key] ?? fallback);
  return out;
};
const CONCERN_LABEL_ZONE = labelZone(SKIN_CONCERN_LABEL, CONCERN_ZONE, "skin");
const GOAL_LABEL_ZONE = labelZone(PROFILE_GOAL_LABEL, GOAL_ZONE, "all");

/** Filtre une liste « a, b ; texte libre » : retire les libellés CONNUS hors zone. */
function filterList(value: string, zones: Map<string, ProfileZone>, s: Scope): string {
  return value
    .split(" ; ")
    .map((chunk) =>
      chunk
        .split(", ")
        .filter((item) => {
          const z = zones.get(item.trim().toLowerCase());
          return z === undefined || inScope(z, s);
        })
        .join(", ")
    )
    .filter((chunk) => chunk.trim().length > 0)
    .join(" ; ");
}

/**
 * Filtre le bloc texte de `formatSkinProfileForPrompt` pour ne garder que la
 * zone du produit. Retire aussi la consigne finale « (ex : pour une peau
 * sèche…) » quand le produit ne concerne pas la peau. null si plus rien.
 */
export function filterProfileBlockForZone(block: string | null | undefined, ctx: ZoneContextLike): string | null {
  if (!block) return null;
  const s = scopeOf(ctx);
  const skinScope = s.face || s.body;
  const kept: string[] = [];
  let dataLines = 0;
  for (const line of block.split("\n")) {
    const m = /^- ([^:]+?) : (.*)$/.exec(line);
    if (!m) {
      // En-tête / consigne finale : l'exemple « peau sèche » n'a pas de sens hors peau.
      if (!skinScope && /peau/i.test(line) && !/^PROFIL/i.test(line)) continue;
      kept.push(line);
      continue;
    }
    const key = m[1].trim().toLowerCase();
    let value = m[2];
    if (key.startsWith("type de peau visage")) { if (!s.face) continue; }
    else if (key.startsWith("type de peau corps")) { if (!s.body) continue; }
    else if (key.startsWith("préoccupations") || key.startsWith("preoccupations")) {
      if (!skinScope) continue;
      value = filterList(value, CONCERN_LABEL_ZONE, s);
    } else if (key.startsWith("cheveux")) { if (!s.hair) continue; }
    else if (key.startsWith("objectifs")) value = filterList(value, GOAL_LABEL_ZONE, s);
    if (!value.trim()) continue;
    kept.push(`- ${m[1]} : ${value}`);
    dataLines++;
  }
  return dataLines > 0 ? kept.join("\n") : null;
}
