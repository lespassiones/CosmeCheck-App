/**
 * personal-insights/relevance.ts : GATING DÉTERMINISTE de la compatibilité.
 *
 * Décide AVANT tout appel IA / débit si le produit relève d'un AXE du profil
 * (peau ou cheveux) et si cet axe est renseigné. Trois issues :
 *   - "product_only"        : hors profil (dentifrice, déo, accessoire…). Jamais
 *                             bloqué : le score se base sur la qualité produit.
 *   - "personal"            : axe rattaché ET renseigné, score personnalisé.
 *   - "profile_incomplete"  : axe rattaché mais VIDE, on renvoie compléter
 *                             EXACTEMENT la section manquante (0 crédit, 0 IA).
 *
 * ZONES (bêta 28 sept 2026, « crème cheveux analysée comme un soin visage ») :
 * les filets déterministes (comédogènes, parfum, alcool, sulfates) et les
 * sensibilités déduites du profil ne se déclenchent plus que si la règle est
 * PERTINENTE pour la zone du produit (cf. productContext.ts) et son usage
 * (rincé ou non). Visage et corps ne sont plus fusionnés.
 *
 * PUR et AUTONOME (aucune dépendance Deno ni sur synthesis/lib) : testable Jest.
 * Le type accepte structurellement le SkinProfile serveur.
 */
import {
  BODY_GROUP,
  FACE_GROUP,
  normText,
  type ProductContext,
  profileAxesOf,
  SKIN_CONTACT_AXES,
  type ZoneContextLike,
  zonesOf,
} from "./productContext.ts";
import { buildZoneProfileBlock } from "./zoneProfile.ts";

export type ProfileAxis = "skin" | "hair" | "none";

/** Sous-ensemble structurel du profil (compatible avec le SkinProfile serveur). */
export type SkinProfileLike = {
  skinTypeFace?: string;
  otherSkinTypeFace?: string;
  skinTypeBody?: string;
  otherSkinTypeBody?: string;
  concerns?: readonly string[];
  hairConcerns?: readonly string[];
  otherConcerns?: string;
  otherHair?: string;
  otherHairConcerns?: string;
  allergiesFreeform?: string;
  otherNotes?: string;
  goals?: readonly string[];
  otherGoals?: string;
  otherGoalsFace?: string;
  otherGoalsBody?: string;
  otherGoalsHair?: string;
  otherGoalsRoutine?: string;
};

/** Objectifs rattachés à l'axe capillaire. */
const HAIR_GOAL_SET = new Set<string>([
  "cheveux_brillants",
  "renforcer_cheveux",
  "definir_boucles",
  "cuir_chevelu_sain",
  "reduire_chute",
]);

// Mots-clés catégorie : axe capillaire (produit cheveux / cuir chevelu).
const HAIR_RE =
  /(shampo|apres[- ]?shampo|après[- ]?shampo|capillaire|cheveu|coiffant|coiffage|revitalisant|conditionn|d[ée]m[êe]l|masque cheveux|soin cheveux|laque|gel coiffant|mousse coiffante|coloration|teinture|balayage|cuir chevelu|antipellicul|anti[- ]?pellicul|pellicul)/i;

// Catégories NON couvertes par le profil (aucune question posée) : jamais bloquer.
const NONE_RE =
  /(dentifrice|brosse[- ]?[àa][- ]?dents|bain de bouche|bucco|dentaire|fil dentaire|d[ée]odorant|anti[- ]?transpirant|accessoire|coton|lingette|éponge|eponge|parfum|eau de toilette|eau de parfum|bougie|maison|m[ée]nage|hygi[èe]ne intime|rasage|compl[ée]ment|v[ée]t[ée]rinaire)/i;

// Mots-clés catégorie : axe peau (visage / corps / solaire / maquillage peau).
const SKIN_RE =
  /(visage|corps|peau|cr[èe]me|s[ée]rum|lait|gommage|masque|nettoyant|d[ée]maquillant|tonique|lotion|contour|solaire|soleil|spf|hydratant|baume|gel douche|douche|mains?|pieds?|anti[- ]?[âa]ge|fond de teint|bb[- ]?cr[èe]me|correcteur|blush|teint|exfoliant|s[ée]bum|acn[ée])/i;

/**
 * TABLE de mapping par SLUG hiérarchique (niveau 2 prioritaire, puis racine),
 * construite sur la cartographie RÉELLE du catalogue (requête juil 2026,
 * ~470k produits). Les libellés texte libre passent par les regex en secours.
 */
const SLUG_AXIS: Record<string, ProfileAxis> = {
  // ── niveau 2 (racines ambiguës) ──
  "hygiene-du-corps/produit-de-bain": "skin",
  "hygiene-du-corps/savon": "skin",
  "hygiene-du-corps/gel-douche": "skin",
  "hygiene-du-corps/deodorant": "none",
  // Taxonomie RÉELLE du catalogue (pluriel, 3 niveaux) : sans cette entrée, un déo
  // `hygiene-du-corps/deodorants/deodorant` retombe sur la racine (skin) par défaut.
  "hygiene-du-corps/deodorants": "none",
  "hygiene-du-corps/hygiene-intime": "none",
  "hygiene-du-corps/papier-toilette-humide": "none",
  "hygiene-du-corps/anti-poux": "hair",
  "maquillage/fond-de-teint-et-poudre": "skin",
  "maquillage/demaquillant": "skin",
  "maquillage/fixateur-de-maquillage": "skin",
  "maquillage/maquillage-a-levres": "none",
  "maquillage/maquillage-des-yeux": "none",
  "maquillage/accessoires-de-maquillage": "none",
  "maquillage/coffret-de-maquillage": "none",
  "maquillage/palette-de-maquillage": "none",
  "maquillage/paillettes": "none",
  "maquillage/encre-et-peinture-corporelle": "none",
  "maquillage/maquillage-de-fete": "none",
  "maquillage/tatouages-ephemeres": "none",
  "rasage-et-epilation/mousse-et-gel-de-rasage": "skin",
  "rasage-et-epilation/apres-rasage": "skin",
  "rasage-et-epilation/huile-de-rasage": "skin",
  "rasage-et-epilation/epilation-et-cire": "skin",
  "rasage-et-epilation/soin-de-la-barbe": "none",
  "rasage-et-epilation/lames-de-rasoir": "none",
  "rasage-et-epilation/rasoir-corps": "none",
  "rasage-et-epilation/rasoir-barbe": "none",
  "bien-etre/massage": "skin",
  "bien-etre/huile-essentielle": "none",
  "bien-etre/sommeil-et-produit-de-relaxation": "none",
  // ── racines (niveau 1) ──
  "soin-du-corps-et-visage": "skin",
  "produit-solaire": "skin",
  "coiffure": "hair",
  "parfum": "none",
  "hygiene-dentaire": "none",
  "manucure-et-pedicure": "none",
  "soin-et-hygiene-bebe": "none", // produit pour bébé : le profil adulte ne s'applique pas
  "sante": "none",
  "bien-etre": "none",
  "hygiene-du-corps": "skin", // défaut racine : produit-de-bain domine (44k vs 18k déo)
  "maquillage": "skin", // défaut racine : le teint domine
  "rasage-et-epilation": "skin", // défaut racine : contact peau
};

/**
 * Déduit l'axe de profil concerné par UNE chaîne de catégorie (API historique,
 * utilisée aussi par goals-coverage). personal-insights passe désormais par
 * `resolveProductContext` (catalogue, nom, type, ingrédients).
 * 1. Slug catalogue : table exacte (niveau 2 puis racine).
 * 2. Texte libre : regex (cheveux d'abord : « masque cheveux » ne doit pas
 *    tomber dans "peau" via « masque », puis "none", puis "peau").
 */
export function categoryToAxis(category: string | null | undefined): ProfileAxis {
  if (!category) return "none";
  const c = category.toLowerCase().trim();
  if (c.includes("/")) {
    const segs = c.split("/");
    const l2 = `${segs[0]}/${segs[1] ?? ""}`;
    if (l2 in SLUG_AXIS) return SLUG_AXIS[l2];
    if (segs[0] in SLUG_AXIS) return SLUG_AXIS[segs[0]];
  } else if (c in SLUG_AXIS) {
    return SLUG_AXIS[c];
  }
  if (HAIR_RE.test(c)) return "hair";
  if (NONE_RE.test(c)) return "none";
  if (SKIN_RE.test(c)) return "skin";
  return "none";
}

function hairFilled(skin: SkinProfileLike): boolean {
  return (skin.hairConcerns?.length ?? 0) > 0
    || Boolean(skin.otherHair)
    || Boolean(skin.otherHairConcerns)
    || Boolean(skin.otherGoalsHair)
    || (skin.goals?.some((g) => HAIR_GOAL_SET.has(g)) ?? false);
}

function skinFilled(skin: SkinProfileLike): boolean {
  return Boolean(skin.skinTypeFace)
    || Boolean(skin.otherSkinTypeFace)
    || Boolean(skin.skinTypeBody)
    || Boolean(skin.otherSkinTypeBody)
    || (skin.concerns?.length ?? 0) > 0
    || Boolean(skin.otherConcerns)
    || Boolean(skin.allergiesFreeform)
    || Boolean(skin.otherGoalsFace)
    || Boolean(skin.otherGoalsBody)
    || Boolean(skin.otherGoalsRoutine)
    || (skin.goals?.some((g) => !HAIR_GOAL_SET.has(g)) ?? false);
}

/** L'axe donné est-il renseigné ? "none" ne bloque jamais. */
export function axisFilled(axis: ProfileAxis, skin: SkinProfileLike): boolean {
  if (axis === "none") return true;
  if (axis === "hair") return hairFilled(skin);
  return skinFilled(skin);
}

/**
 * Le profil contient-il LA MOINDRE donnée (peau OU cheveux) ? Décide du mode
 * product_only : TOUT produit est personnalisé dès que le profil est rempli
 * (décision user, juil 2026 : « tout doit être analysé, l'IA cherche
 * elle-même ; si elle ne trouve rien tant pis »), un déodorant à la
 * niacinamide sert « tes boutons ». Seul un profil VIDE : score = qualité.
 */
export function profileHasData(skin: SkinProfileLike): boolean {
  return skinFilled(skin) || hairFilled(skin);
}

// ── Filets déterministes « against » (campagne E2E juil 2026, zones sept 2026) ──
// Le LLM ignore parfois des cas critiques malgré des consignes OBLIGATOIRES :
// on les détecte donc CÔTÉ CODE et on force le malus, MAIS seulement quand la
// règle a un sens pour la zone et l'usage du produit.

export type ForcedAgainst = { name: string; need: string };

/** INCI d'alcool asséchant (ancré : ne matche PAS cetyl/cetearyl alcohol, gras). */
const DRYING_ALCOHOL_RE = /^(sd\s+)?alcohol(\s+denat\.?)?(\s+\d+-?\w*)?$/i;

// Allergènes de parfum (UE) : sur peau sensible/réactive, à écarter MÊME sans
// allergie déclarée (beaucoup l'ignorent).
const FRAGRANCE_ALLERGENS = [
  "parfum", "fragrance", "limonene", "linalool", "citronellol", "geraniol", "citral",
  "coumarin", "eugenol", "cinnamal", "hexyl cinnamal", "benzyl salicylate", "benzyl benzoate",
  "alpha-isomethyl ionone", "hydroxycitronellal", "isoeugenol", "farnesol", "amyl cinnamal",
  "cinnamyl alcohol", "anise alcohol", "butylphenyl methylpropional", "evernia",
];
// Corps gras comédogènes : sur peau grasse/acnéique du VISAGE, aggravent
// boutons/points noirs. Noms INCI puis noms grand public (sortie IA).
const COMEDOGENIC = [
  "cocos nucifera", "coconut oil", "theobroma cacao", "cocoa butter", "isopropyl myristate",
  "isopropyl palmitate", "myristyl myristate", "triticum vulgare germ", "wheat germ",
  "linum usitatissimum", "linseed", "laureth-4", "oleth-3", "lanolin", "butyl stearate",
  "decyl oleate", "cetyl acetate",
];
const COMEDOGENIC_FR = [
  "huile de coco", "beurre de cacao", "myristate d'isopropyle", "palmitate d'isopropyle",
  "germe de ble", "huile de lin", "lanoline",
];
// Sulfates agressifs.
const SULFATES = [
  "sodium lauryl sulfate", "sodium laureth sulfate", "ammonium lauryl sulfate", "ammonium laureth sulfate",
];

const ALLERGY_STOPWORDS = new Set([
  "allergie", "allergique", "allergies", "suis", "very", "tres", "très", "avec",
  "sans", "pour", "dans", "les", "des", "aux", "une", "mon", "mes", "est",
]);

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

const FACE_SENSITIVE_CONCERNS = ["rougeurs", "sensibilite", "eczema", "rosacee", "couperose", "reactivite", "dermatite"];
// Rougeurs / rosacée / couperose : préoccupations du VISAGE, pas du corps.
const BODY_SENSITIVE_CONCERNS = ["sensibilite", "eczema", "reactivite", "dermatite"];
const ACNE_CONCERNS = ["acne", "points_noirs", "imperfections", "boutons", "exces_sebum", "brillance"];
const ACNE_GOALS = ["attenuer_boutons", "reduire_imperfections", "matifier"];

/**
 * Contexte par défaut quand l'appelant n'en fournit pas : TOUTES les zones et
 * usage inconnu, soit exactement le comportement historique (visage + corps +
 * cheveux fusionnés). personal-insights passe toujours un contexte résolu.
 */
export const LEGACY_ALL_ZONES: ZoneContextLike = {
  axis: "face",
  zones: ["face", "body", "hair"],
  usage: "unknown",
};

type ZoneFlags = { face: boolean; body: boolean; hair: boolean; leaveOn: boolean };

function flagsOf(ctx: ZoneContextLike): ZoneFlags {
  const zones = zonesOf(ctx);
  const all = zones.includes("none"); // zone inconnue : comportement historique
  return {
    face: all || zones.some((z) => FACE_GROUP.includes(z)),
    body: all || zones.some((z) => BODY_GROUP.includes(z)),
    hair: all || zones.includes("hair"),
    // Usage inconnu : traité comme un sans-rinçage (prudence, comportement historique).
    leaveOn: ctx.usage !== "rinse_off",
  };
}

/**
 * Détecte les contre-indications GARANTIES par le code (l'IA rate ces cas, même
 * avec un prompt musclé, prouvé E2E), SELON LA ZONE ET L'USAGE du produit :
 *  1. Alcool asséchant : peau sèche/sensible DE LA ZONE (visage ou corps), sans
 *     rinçage ; cheveux secs/cassants pour un soin capillaire sans rinçage.
 *  2. Allergènes de parfum : peau sensible DE LA ZONE. Sans rinçage : un malus
 *     par allergène (historique) ; produit rincé : UN SEUL malus (contact bref).
 *  3. Comédogènes : peau grasse/acnéique du VISAGE, soin VISAGE sans rinçage
 *     UNIQUEMENT (jamais un soin capillaire, un soin corps ou un produit rincé).
 *  4. Sulfates : cuir chevelu sensible ou cheveux secs (produit capillaire) ;
 *     peau sensible/sèche de la zone (produit de peau). Rincé ou non : ce sont
 *     justement des agents lavants.
 *  5. Allergie déclarée (texte libre) × ingrédient présent : TOUTES zones.
 * `ctx` absent : toutes zones, usage inconnu (comportement historique).
 * Renvoie jusqu'à 10 (le cap final AGAINST_MAX est appliqué dans enforce).
 */
export function detectForcedAgainst(
  items: { name?: string | null; input?: string | null }[],
  skin: SkinProfileLike,
  ctx: ZoneContextLike = LEGACY_ALL_ZONES,
): ForcedAgainst[] {
  const out: ForcedAgainst[] = [];
  const nameOf = (i: { name?: string | null; input?: string | null }) => (i.name ?? i.input ?? "").trim();
  const push = (name: string, need: string) => {
    const nm = name.trim();
    if (!nm || out.some((o) => normalize(o.name) === normalize(nm))) return;
    out.push({ name: nm, need });
  };
  const z = flagsOf(ctx);

  const face = (skin.skinTypeFace ?? "").toLowerCase();
  const body = (skin.skinTypeBody ?? "").toLowerCase();
  const concerns = (skin.concerns ?? []).map((c) => c.toLowerCase());
  const goals = (skin.goals ?? []).map((g) => g.toLowerCase());
  const hair = (skin.hairConcerns ?? []).map((h) => h.toLowerCase());

  // Type de peau SELON LA ZONE (plus de fusion visage + corps).
  const faceSensitive = face === "sensible" || concerns.some((c) => FACE_SENSITIVE_CONCERNS.includes(c));
  const bodySensitive = body === "sensible" || concerns.some((c) => BODY_SENSITIVE_CONCERNS.includes(c));
  const faceDry = face === "seche" || face === "tres_seche" || concerns.includes("secheresse");
  const bodyDry = body === "seche" || body === "tres_seche" || concerns.includes("secheresse");
  const faceAcne = face === "grasse"
    || concerns.some((c) => ACNE_CONCERNS.includes(c))
    || goals.some((g) => ACNE_GOALS.includes(g));
  const scalpSensitive = hair.some((h) => ["cuir_chevelu_sensible", "pellicules", "demangeaisons"].includes(h));
  const hairDry = hair.some((h) => ["secs", "ternes_cassants"].includes(h));

  const sensitiveHere = (z.face && faceSensitive) || (z.body && bodySensitive);
  const dryHere = (z.face && faceDry) || (z.body && bodyDry);

  // 1. Alcool asséchant (contact prolongé uniquement).
  const hasDryingAlcohol = items.some((i) => DRYING_ALCOHOL_RE.test(nameOf(i)));
  if (hasDryingAlcohol && z.leaveOn) {
    if (sensitiveHere || dryHere) push("alcool", "ta peau sensible ou sèche");
    else if (z.hair && hairDry) push("alcool", "tes cheveux secs");
  }
  // 2. Allergènes de parfum × peau sensible de la zone.
  if (sensitiveHere) {
    const isFragrance = (n: string) => FRAGRANCE_ALLERGENS.some((a) => n === normalize(a) || n.includes(normalize(a)));
    const hits = items.filter((it) => {
      const n = normalize(nameOf(it));
      return n.length > 0 && isFragrance(n);
    });
    // Rincé : un seul malus (le premier allergène, de préférence « parfum »).
    const retained = z.leaveOn
      ? hits
      : hits.filter((it) => /parfum|fragrance/.test(normalize(nameOf(it)))).concat(hits).slice(0, 1);
    for (const it of retained) push(nameOf(it), "ta peau sensible");
  }
  // 3. Comédogènes × peau grasse/acné : soin VISAGE sans rinçage uniquement.
  if (faceAcne && z.leaveOn && zonesOf(ctx).some((x) => x === "face" || x === "none")) {
    for (const it of items) {
      const n = normalize(nameOf(it));
      if (n && COMEDOGENIC.some((k) => n.includes(normalize(k)))) push(nameOf(it), "ta peau grasse et tes imperfections");
    }
  }
  // 4. Sulfates agressifs : cheveux (cuir chevelu sensible, cheveux secs) puis peau de la zone.
  const sulfateNeed = z.hair && scalpSensitive
    ? "ton cuir chevelu sensible"
    : z.hair && hairDry
    ? "tes cheveux secs"
    : sensitiveHere
    ? "ta peau sensible"
    : dryHere
    ? "ta peau sèche"
    : null;
  if (sulfateNeed) {
    for (const it of items) {
      const n = normalize(nameOf(it));
      if (n && SULFATES.some((k) => n.includes(normalize(k)))) push(nameOf(it), sulfateNeed);
    }
  }
  // 5. Allergie DÉCLARÉE (texte libre) × ingrédient présent : libellé prioritaire.
  const allergyText = normalize(skin.allergiesFreeform ?? "");
  if (allergyText) {
    const tokens = [...new Set(allergyText.split(/[^a-z]+/).filter((t) => t.length >= 4 && !ALLERGY_STOPWORDS.has(t)))];
    for (const item of items) {
      const n = normalize(nameOf(item));
      if (!n) continue;
      const tok = tokens.find((t) => n.includes(t) || t.includes(n));
      if (tok) {
        const idx = out.findIndex((o) => normalize(o.name) === n);
        if (idx >= 0) out[idx] = { name: nameOf(item), need: `ton allergie (${tok})` };
        else out.push({ name: nameOf(item), need: `ton allergie (${tok})` });
      }
    }
  }

  return out.slice(0, 10);
}

// ── Sensibilités DÉDUITES du profil (worker profile-restriction-inference) ────
// « allergie / allergique / intolérance » (PAS « allergènes » : le libellé
// « Parfum / allergènes » n'est pas une allergie déclarée).
const ALLERGY_REASON_RE = /\b(allergie\w*|allergique\w*|intoleran\w*)\b/;
const HAIR_REASON_RE =
  /\b(cheveux?|capillaires?|cuir chevelu|pellicules?|boucles?|bouclees?|chute|casse|cassants?|longueurs|scalp|colores?|frises?|crepus)\b/;
/** Raisons « acné » : ne concernent QUE le visage, et seulement sans rinçage. */
const ACNE_REASON_RE =
  /\b(acne\w*|boutons?|imperfections?|points? noirs?|pores?|sebum|brillance|grasses?|comedo\w*)\b/;
const FACE_REASON_RE = /\b(visage|rougeurs?|couperose|rosacee|teint|rides?|taches?)\b/;
const BODY_REASON_RE = /\b(corps|vergetures?|cellulite|jambes?)\b/;
/** Mots qui désignent la PEAU sans ambiguïté. */
const SKIN_EXPLICIT_REASON_RE = /\b(peaux?|eczema|atopi\w*|dermat\w*|tiraill\w*|deshydrat\w*)\b/;
/** Adjectifs partagés avec le cuir chevelu (« cuir chevelu sensible ») : peau
 *  seulement si la raison ne parle pas de cheveux. */
const SKIN_ADJ_REASON_RE = /\b(seches?|sensibles?|reactives?|irrit\w*)\b/;
const COMEDOGENIC_LABEL_RE = /\b(comedo\w*|occlusi\w*)\b/;
const DRYING_ALCOHOL_LABEL_RE = /\balcool\w*\b/;

/**
 * Une sensibilité déduite (label + raison, ex. « Huiles comédogènes » / « acné
 * déclarée ») s'applique-t-elle à CE produit ? Une sensibilité « peau acnéique »
 * ne pénalise pas un shampooing ; « cuir chevelu sensible » ne pénalise pas un
 * gel douche ; une allergie s'applique partout.
 */
export function inferredSensitivityApplies(
  item: { label?: string | null; reason?: string | null; slug?: string | null },
  ctx: ZoneContextLike,
): boolean {
  const text = normText(`${item.label ?? ""} ${item.reason ?? ""} ${item.slug ?? ""}`);
  if (ALLERGY_REASON_RE.test(text)) return true;
  const zones = zonesOf(ctx);
  if (zones.includes("none")) return true; // zone inconnue : comportement historique

  const onFace = zones.includes("face");
  const onFaceGroup = zones.some((z) => FACE_GROUP.includes(z));
  const onBody = zones.some((z) => BODY_GROUP.includes(z));
  const onSkin = zones.some((z) => SKIN_CONTACT_AXES.includes(z));
  const onHair = zones.includes("hair");
  const leaveOn = ctx.usage !== "rinse_off";

  const label = normText(item.label ?? "");
  const comedogenicKind = COMEDOGENIC_LABEL_RE.test(label);
  const alcoholKind = DRYING_ALCOHOL_LABEL_RE.test(label);

  const reasonHair = HAIR_REASON_RE.test(text);
  const reasonAcne = ACNE_REASON_RE.test(text) || comedogenicKind;
  const reasonFace = FACE_REASON_RE.test(text);
  const reasonBody = BODY_REASON_RE.test(text);
  const reasonSkin = SKIN_EXPLICIT_REASON_RE.test(text) || (SKIN_ADJ_REASON_RE.test(text) && !reasonHair);
  const known = reasonHair || reasonAcne || reasonFace || reasonBody || reasonSkin;

  // Contact prolongé seulement : comédogènes et alcool asséchant ne comptent pas en rincé.
  if ((comedogenicKind || alcoholKind) && !leaveOn) return false;

  if (reasonHair && onHair) return true;
  if (reasonAcne && onFace && leaveOn) return true;
  if (reasonFace && onFaceGroup && !reasonAcne) return true;
  if (reasonBody && onBody) return true;
  if (reasonSkin && !reasonAcne && onSkin) {
    // « peau du visage » / « peau du corps » : restreint à cette zone.
    if (reasonFace && !reasonBody) return onFaceGroup;
    if (reasonBody && !reasonFace) return onBody;
    return true;
  }
  if (!known) {
    // Raison muette : on garde l'ancien comportement, sauf pour les comédogènes
    // (visage sans rinçage) qui n'ont de sens qu'au visage.
    if (comedogenicKind) return onFace && leaveOn;
    return onSkin || onHair;
  }
  return false;
}

// ── Garde-fou des lignes IA (contributeurs / contre-indications) ─────────────
const NEED_ALWAYS_RE = /\b(allergie\w*|allergique\w*|intoleran\w*|restriction\w*)\b/;
const NEED_HAIR_RE =
  /\b(cheveux?|capillaires?|cuir chevelu|pellicules?|boucles?|longueurs|pointes|chute|casse|frisottis|racines)\b/;
const NEED_FACE_ONLY_RE =
  /\b(visage|teint|acne|boutons?|imperfections?|points? noirs?|pores|sebum|brillance|rougeurs?|couperose|rosacee|rides?|ridules|taches?|cernes|matifier|matite|peau grasse)\b/;
const NEED_BODY_ONLY_RE = /\b(corps|vergetures?|cellulite|jambes?)\b/;
const NEED_SKIN_RE = /\b(peau|eczema|atopi\w*|levres?|mains|pieds)\b/;

/**
 * Le besoin cité par l'IA (« ta peau grasse », « tes cheveux secs »…) concerne-
 * t-il la zone du produit ? Filet APRÈS le LLM : même si le prompt est ignoré,
 * un « à éviter pour ta peau grasse » ne peut plus pénaliser un soin capillaire.
 * Besoin neutre (« ton objectif hydratation ») : conservé.
 */
export function needFitsZone(need: string, ctx: ZoneContextLike): boolean {
  const n = normText(need);
  if (!n || NEED_ALWAYS_RE.test(n)) return true;
  const zones = zonesOf(ctx);
  if (zones.includes("none")) return true;
  const hairNeed = NEED_HAIR_RE.test(n);
  const faceNeed = NEED_FACE_ONLY_RE.test(n);
  const bodyNeed = NEED_BODY_ONLY_RE.test(n);
  const skinNeed = faceNeed || bodyNeed || NEED_SKIN_RE.test(n);
  if (hairNeed && skinNeed) return true; // besoin mixte : on ne tranche pas
  const onHair = zones.includes("hair");
  const onFaceGroup = zones.some((z) => FACE_GROUP.includes(z));
  const onBody = zones.some((z) => BODY_GROUP.includes(z));
  if (hairNeed) return onHair;
  if (skinNeed) {
    if (!onFaceGroup && !onBody) return false;
    if (faceNeed && !bodyNeed && !onFaceGroup) return false;
    if (bodyNeed && !faceNeed && !onBody) return false;
  }
  return true;
}

/**
 * Contre-indication IA compatible avec l'USAGE ? Sur un produit rincé, un
 * comédogène ou un alcool asséchant n'est pas un risque (contact bref).
 */
export function againstFitsUsage(ingredient: string, ctx: ZoneContextLike): boolean {
  if (ctx.usage !== "rinse_off") return true;
  const n = normalize(ingredient);
  if (/^alcool\b|^alcohol\b|alcool denature|alcohol denat/.test(n)) return false;
  return ![...COMEDOGENIC, ...COMEDOGENIC_FR].some((k) => n.includes(normalize(k)));
}

export type RelevanceVerdict =
  | { kind: "personal"; axis: "skin" | "hair" }
  | { kind: "product_only" }
  | { kind: "profile_incomplete"; missingSection: "skin" | "hair" };

/** Verdict de pertinence depuis UNE chaîne de catégorie (API historique). */
export function relevanceVerdict(
  category: string | null | undefined,
  skin: SkinProfileLike,
): RelevanceVerdict {
  const axis = categoryToAxis(category);
  if (axis === "none") return { kind: "product_only" };
  if (axisFilled(axis, skin)) return { kind: "personal", axis };
  return { kind: "profile_incomplete", missingSection: axis };
}

/**
 * Verdict de pertinence depuis le CONTEXTE PRODUIT résolu (zones + usage).
 *  - aucune zone du profil (déo, dentifrice, parfum, maquillage yeux/lèvres) : product_only ;
 *  - axe du profil vide (ex. soin capillaire, section cheveux vide) : profile_incomplete ;
 *  - axe rempli mais RIEN pour cette zone (ex. lait corps, seul le type de peau
 *    du VISAGE est renseigné) : product_only (score = qualité, rien d'inventé) ;
 *  - sinon personal.
 */
export function relevanceVerdictForContext(
  ctx: Pick<ProductContext, "axis" | "zones" | "usage" | "makeup">,
  skin: SkinProfileLike,
): RelevanceVerdict {
  const axes = profileAxesOf(ctx);
  if (axes.length === 0) return { kind: "product_only" };
  const filled = axes.find((a) => axisFilled(a, skin));
  if (!filled) return { kind: "profile_incomplete", missingSection: axes[0] };
  if (buildZoneProfileBlock(skin, ctx) === null) return { kind: "product_only" };
  return { kind: "personal", axis: filled };
}
