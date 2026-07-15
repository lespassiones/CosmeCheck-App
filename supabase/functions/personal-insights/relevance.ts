/**
 * personal-insights/relevance.ts — GATING DÉTERMINISTE de la compatibilité.
 *
 * Décide AVANT tout appel IA / débit si le produit relève d'un AXE du profil
 * (peau ou cheveux) et si cet axe est renseigné. Trois issues :
 *   - "product_only"        → hors profil (dentifrice, déo, accessoire…). Jamais
 *                             bloqué : le score se base sur la qualité produit.
 *   - "personal"            → axe rattaché ET renseigné → score personnalisé.
 *   - "profile_incomplete"  → axe rattaché mais VIDE → on renvoie compléter
 *                             EXACTEMENT la section manquante (0 crédit, 0 IA).
 *
 * PUR et AUTONOME (aucune dépendance Deno ni sur synthesis/lib) → testable Jest.
 * Le type accepte structurellement le SkinProfile serveur.
 */

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
  allergiesFreeform?: string;
  goals?: readonly string[];
  otherGoals?: string;
};

/** Objectifs rattachés à l'axe capillaire. */
const HAIR_GOAL_SET = new Set<string>([
  "cheveux_brillants",
  "renforcer_cheveux",
  "definir_boucles",
  "cuir_chevelu_sain",
  "reduire_chute",
]);

// Mots-clés catégorie → axe capillaire (produit cheveux / cuir chevelu).
const HAIR_RE =
  /(shampo|apres[- ]?shampo|après[- ]?shampo|capillaire|cheveu|coiffant|coiffage|revitalisant|conditionn|d[ée]m[êe]l|masque cheveux|soin cheveux|laque|gel coiffant|mousse coiffante|coloration|teinture|balayage|cuir chevelu|antipellicul|anti[- ]?pellicul|pellicul)/i;

// Catégories NON couvertes par le profil (aucune question posée) → jamais bloquer.
const NONE_RE =
  /(dentifrice|brosse[- ]?[àa][- ]?dents|bain de bouche|bucco|dentaire|fil dentaire|d[ée]odorant|anti[- ]?transpirant|accessoire|coton|lingette|éponge|eponge|parfum|eau de toilette|eau de parfum|bougie|maison|m[ée]nage|hygi[èe]ne intime|rasage|compl[ée]ment|v[ée]t[ée]rinaire)/i;

// Mots-clés catégorie → axe peau (visage / corps / solaire / maquillage peau).
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
 * Déduit l'axe de profil concerné par la catégorie produit.
 * 1. Slug catalogue → table exacte (niveau 2 puis racine).
 * 2. Texte libre → regex (cheveux d'abord : « masque cheveux » ne doit pas
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
    || (skin.goals?.some((g) => !HAIR_GOAL_SET.has(g)) ?? false);
}

/** L'axe donné est-il renseigné ? "none" ne bloque jamais. */
export function axisFilled(axis: ProfileAxis, skin: SkinProfileLike): boolean {
  if (axis === "none") return true;
  if (axis === "hair") return hairFilled(skin);
  return skinFilled(skin);
}

// ── Filets déterministes « against » (campagne E2E juil 2026) ────────────────
// Le LLM ignore parfois deux cas critiques malgré des consignes OBLIGATOIRES :
// l'alcool asséchant sur peau sèche/sensible, et l'allergie en texte libre à un
// ingrédient présent. On les détecte donc CÔTÉ CODE et on force le malus.

export type ForcedAgainst = { name: string; need: string };

/** INCI d'alcool asséchant (ancré : ne matche PAS cetyl/cetearyl alcohol, gras). */
const DRYING_ALCOHOL_RE = /^(sd\s+)?alcohol(\s+denat\.?)?(\s+\d+-?\w*)?$/i;

const ALLERGY_STOPWORDS = new Set([
  "allergie", "allergique", "allergies", "suis", "very", "tres", "très", "avec",
  "sans", "pour", "dans", "les", "des", "aux", "une", "mon", "mes", "est",
]);

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

/**
 * Détecte les contre-indications GARANTIES par le code :
 *  1. Alcool asséchant présent + peau sèche/sensible déclarée.
 *  2. Allergie texte libre dont un mot matche un ingrédient présent.
 * Renvoie au plus 2 entrées (cap du barème).
 */
export function detectForcedAgainst(
  items: { name?: string | null; input?: string | null }[],
  skin: SkinProfileLike,
): ForcedAgainst[] {
  const out: ForcedAgainst[] = [];

  // 1. Alcool asséchant × peau sèche/sensible
  const drySensitive = skin.skinTypeFace === "sensible" || skin.skinTypeFace === "seche"
    || skin.skinTypeBody === "seche" || skin.skinTypeBody === "tres_seche" || skin.skinTypeBody === "sensible"
    || (skin.concerns ?? []).some((c) => c === "secheresse" || c === "sensibilite" || c === "rougeurs");
  if (drySensitive) {
    const hit = items.find((i) => DRYING_ALCOHOL_RE.test((i.name ?? i.input ?? "").trim()));
    if (hit) out.push({ name: "alcool", need: "ta peau sensible ou sèche" });
  }

  // 2. Allergie texte libre × ingrédient présent (match par mot significatif)
  const allergyText = normalize(skin.allergiesFreeform ?? "");
  if (allergyText) {
    const tokens = [...new Set(allergyText.split(/[^a-z]+/).filter((t) => t.length >= 4 && !ALLERGY_STOPWORDS.has(t)))];
    for (const item of items) {
      const n = normalize(item.name ?? item.input ?? "");
      if (!n) continue;
      const tok = tokens.find((t) => n.includes(t) || t.includes(n));
      if (tok && !out.some((o) => normalize(o.name) === n)) {
        out.push({ name: item.name ?? item.input ?? tok, need: `ton allergie (${tok})` });
      }
    }
  }

  return out.slice(0, 2);
}

export type RelevanceVerdict =
  | { kind: "personal"; axis: "skin" | "hair" }
  | { kind: "product_only" }
  | { kind: "profile_incomplete"; missingSection: "skin" | "hair" };

/** Verdict de pertinence (avant tout appel IA / crédit). */
export function relevanceVerdict(
  category: string | null | undefined,
  skin: SkinProfileLike,
): RelevanceVerdict {
  const axis = categoryToAxis(category);
  if (axis === "none") return { kind: "product_only" };
  if (axisFilled(axis, skin)) return { kind: "personal", axis };
  return { kind: "profile_incomplete", missingSection: axis };
}
