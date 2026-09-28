/**
 * personal-insights/productContext.ts : RÉSOLVEUR DE CONTEXTE PRODUIT (pur).
 *
 * Retour bêta prioritaire (28 sept 2026) : « Il analyse les ingrédients d'une
 * crème cheveux comme si c'était pour le visage. » Le score de compatibilité et
 * les 3 blocs IA appliquaient des règles de PEAU (comédogènes vs peau grasse,
 * parfum vs peau sensible, alcool vs peau sèche) à un soin capillaire, parce que
 * la zone du produit était déduite d'UNE seule chaîne (texte libre en premier)
 * et que visage et corps étaient fusionnés en un seul axe « peau ».
 *
 * Ce module répond à deux questions, sans aucun appel réseau :
 *   1. OÙ s'applique le produit ? (`axis` principal + `zones` si multi-zones)
 *   2. COMBIEN DE TEMPS reste-t-il en contact ? (`usage` : rincé ou non)
 *
 * Ordre des signaux (du plus fiable au moins fiable) :
 *   1. catégorie CATALOGUE (slug hiérarchique curé, ex. `coiffure/soin-capillaire/…`) ;
 *   2. marqueurs du NOM du produit ;
 *   3. type de produit en texte libre (`product_type`, étiquette catalogue brute) ;
 *   4. catégorie PRÉCISE (slug LLM tenant compte du nom) ;
 *   5. catégorie grossière de l'analyseur (`creme_corps`…, LLM sur 5 ingrédients) ;
 *   6. indices INGRÉDIENTS (conditionneurs capillaires, base lavante, fluor…).
 * Un signal « peau, zone inconnue » (ex. « Crème riche ») ne tranche pas : on
 * continue à chercher, et à défaut on garde visage + corps (comportement
 * historique, prudent). Une catégorie catalogue « peau » VERROUILLE la famille :
 * un signal plus faible peut préciser visage/corps, jamais basculer en cheveux.
 *
 * PUR et AUTONOME (seule dépendance : les marqueurs capillaires partagés avec le
 * garde-fou de l'analyseur, eux aussi purs) : testable en Jest (env node).
 */
import { hasHairMarker } from "../analyser/engine.ts";

export type ProductAxis =
  | "hair"
  | "face"
  | "body"
  | "lips"
  | "eyes"
  | "hands"
  | "feet"
  | "oral"
  | "underarm"
  | "nails"
  | "none";

/** rinse_off = rincé OU retiré juste après application (nettoyant, démaquillant). */
export type ProductUsage = "rinse_off" | "leave_on" | "unknown";

export type ContextSource = "catalog" | "name" | "category" | "ingredients" | "none";

/** Sous-ensemble suffisant pour appliquer les règles par zone (tests, prompts). */
export type ZoneContextLike = {
  axis: ProductAxis;
  /** Toutes les zones concernées, `axis` en tête. Absent = [axis]. */
  zones?: readonly ProductAxis[];
  usage: ProductUsage;
};

export type ProductContext = {
  axis: ProductAxis;
  zones: ProductAxis[];
  usage: ProductUsage;
  /** D'où vient la zone retenue (debug, persistance). */
  source: ContextSource;
  /** false = produit de peau dont on ne sait pas s'il va sur le visage ou le corps. */
  zoneCertain: boolean;
  /** Maquillage lèvres/yeux : hors profil peau (décision historique conservée). */
  makeup: boolean;
};

export type ProductContextInput = {
  /** Catégorie catalogue curée (EAN catalogué). */
  catalogCategory?: string | null;
  /** result_json.category / analyses.category : slug catalogue OU enum analyseur. */
  categories?: readonly (string | null | undefined)[];
  /** Type en texte libre (analyses.product_type, result_json.productType). */
  productType?: string | null;
  /** analyses.category_precise (slug LLM « famille/sous/type »). */
  categoryPrecise?: string | null;
  /** Libellé du produit (SANS la marque : « The Body Shop » n'est pas un soin corps). */
  productName?: string | null;
  items?: readonly { name?: string | null; input?: string | null }[];
};

// ── Groupes de zones ─────────────────────────────────────────────────────────
export const FACE_GROUP: readonly ProductAxis[] = ["face", "eyes", "lips"];
export const BODY_GROUP: readonly ProductAxis[] = ["body", "hands", "feet", "underarm"];
export const SKIN_CONTACT_AXES: readonly ProductAxis[] = [...FACE_GROUP, ...BODY_GROUP];

export function zonesOf(ctx: ZoneContextLike): readonly ProductAxis[] {
  return ctx.zones && ctx.zones.length > 0 ? ctx.zones : [ctx.axis];
}

// ── Normalisation ────────────────────────────────────────────────────────────
const DIACRITICS_RE = new RegExp("[\\u0300-\\u036f]", "g");

/** Minuscule, sans accent, ponctuation remplacée par des espaces. */
export function normText(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(DIACRITICS_RE, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// ── Marqueurs texte (appliqués sur normText) ─────────────────────────────────
// Produits hors zones peau/cheveux.
const FRAGRANCE_PRODUCT_RE =
  /\b(eau de parfum|eau de toilette|eau de cologne|extrait de parfum|brume parfumee|body mist|hair mist|parfum pour cheveux)\b/;
const ORAL_RE =
  /\b(dentifrice|toothpaste|bain de bouche|mouthwash|rince bouche|dentaire|dents|gencives?|haleine)\b/;
const UNDERARM_RE = /\b(deodorant|deo|anti ?transpirant|antitranspirant|antiperspirant|aisselles?)\b/;
const LIP_MAKEUP_RE =
  /\b(rouge a levres|lipstick|gloss|encre a levres|vernis a levres|crayon a levres|crayon levres|lip tint|lip gloss)\b/;
const EYE_MAKEUP_RE =
  /\b(mascara|eyeliner|eye liner|khol|kohl|fard a paupieres|ombre a paupieres|crayon yeux|crayon pour les yeux)\b/;
const NAILS_RE = /\b(vernis|nail|nails|ongles?|dissolvant|cuticules?|manucure|top coat|base coat)\b/;
const NONE_OTHER_RE =
  /\b(bougie|diffuseur|parfum d ambiance|lessive|complement alimentaire|gelules?|intime|intimate|lubrifiant)\b/;

// Zones de peau. EXPLICITES = la zone est nommée (« visage », « corps ») ;
// IMPLICITES = un usage typique (« sérum », « tonique », « bain ») qui, à côté
// d'un marqueur capillaire, désigne un produit cheveux (« sérum capillaire »,
// « lotion tonique cuir chevelu », « bain » Kérastase) et NON une zone de peau.
const FACE_EXPLICIT_RE = /\b(visage|face|facial|faciale)\b/;
const FACE_IMPLICIT_RE =
  /\b(teint|anti ?age|anti ?rides?|rides|ridules|serum|demaquillant|demaquillante|micellaire|tonique|toner|fond de teint|foundation|bb cream|cc cream|bb creme|cc creme|correcteur|blush|highlighter|primer|acne|imperfections?|boutons?|points? noirs?|pores|creme de jour|creme de nuit|creme jour|creme nuit|soin de nuit|soin de jour|eau thermale)\b/;
const EYES_RE =
  /\b(contour des yeux|contour yeux|yeux|eye|eyes|paupieres?|cils|sourcils|cernes|poches|anti ?cernes)\b/;
const LIPS_RE = /\b(levres?|lip|lips|lipbalm)\b/;
const HANDS_RE = /\b(mains|hand cream|hand balm|hands)\b/;
const FEET_RE = /\b(pieds?|feet|foot|talons?)\b/;
const BODY_EXPLICIT_RE = /\b(corps|corporel|corporelle|body|douche|shower)\b/;
const BODY_IMPLICIT_RE = /\b(bain|bath|jambes?|vergetures?|cellulite|minceur|amincissant)\b/;
/** Indices corps FAIBLES : ne servent qu'en l'absence de toute autre zone, et
 *  ne tranchent pas visage/corps (une crème solaire ou un savon vont sur les deux). */
const BODY_WEAK_RE =
  /\b(savon|soap|solaire|spf|sunscreen|ecran solaire|apres soleil|after sun|autobronzant|self tan|huile seche)\b/;
/** Produit de peau SANS zone (« Crème riche ») : ne tranche pas visage/corps. */
const GENERIC_SKIN_RE =
  /\b(creme|cream|lotion|lait|milk|baume|balm|huile|oil|gel|masque|mask|gommage|scrub|exfoliant|hydratant|hydratante|moisturi[sz]er|nourrissant|nourrissante|apaisant|apaisante|soin|fluide|emulsion|beurre|butter|brume|mousse|peau|skin)\b/;

// Usage (contact bref ou prolongé).
const LEAVE_EXPLICIT_RE =
  /\b(sans rincage|leave in|leave on|no rinse|masque de nuit|sleeping mask|overnight|shampo\w* sec|dry shampoo)\b/;
const RINSE_RE =
  /\b(shampoing|shampooing|shampoo|apres shampo\w*|conditioner|co wash|cowash|gel douche|douche|shower|bain|bath|savon|soap|nettoyant|nettoyante|lavant|lavante|cleanser|cleansing|wash|demaquillant|demaquillante|micellaire|gommage|scrub|exfoliant|peeling|masque|mask|mousse a raser|gel a raser|creme a raser|savon a raser|de rasage|depilatoire|dentifrice|dissolvant|coloration)\b/;
const LEAVE_RE =
  /\b(creme|cream|lait|milk|lotion|baume|balm|serum|huile|oil|fluide|emulsion|brume|mist|spray|laque|cire|coiffant|coiffante|fond de teint|deodorant|solaire|spf|apres soleil|autobronzant|apres rasage|contour|stick|rouge a levres|mascara|vernis|soin|hydratant|hydratante|tonique)\b/;

export function usageFromText(t: string): ProductUsage {
  if (!t) return "unknown";
  if (LEAVE_EXPLICIT_RE.test(t)) return "leave_on";
  if (RINSE_RE.test(t)) return "rinse_off";
  if (LEAVE_RE.test(t)) return "leave_on";
  return "unknown";
}

// ── Étapes de résolution ─────────────────────────────────────────────────────
type Step = {
  /** Zones trouvées (vide = l'étape n'apporte qu'un usage). */
  zones: ProductAxis[];
  usage: ProductUsage;
  /** false = « peau, zone inconnue » : ne tranche pas visage/corps. */
  certain: boolean;
  /** Étape catalogue incertaine : verrouille la FAMILLE peau. */
  lockSkinFamily?: boolean;
  makeup?: boolean;
  source: ContextSource;
};

const step = (
  zones: ProductAxis[],
  usage: ProductUsage,
  source: ContextSource,
  extra?: Partial<Pick<Step, "certain" | "lockSkinFamily" | "makeup">>,
): Step => ({ zones, usage, source, certain: extra?.certain ?? true, ...extra });

/**
 * Zones de peau nommées dans un texte normalisé (la plus spécifique d'abord).
 * `explicitOnly` (produit capillaire) : seules les zones NOMMÉES comptent.
 * `weakOnly` : seule une indication faible (solaire, savon) a été trouvée.
 */
function skinZonesFromText(t: string, explicitOnly = false): { zones: ProductAxis[]; weakOnly: boolean } {
  const z: ProductAxis[] = [];
  if (FACE_EXPLICIT_RE.test(t) || (!explicitOnly && FACE_IMPLICIT_RE.test(t))) z.push("face");
  if (EYES_RE.test(t)) z.push("eyes");
  if (LIPS_RE.test(t)) z.push("lips");
  if (HANDS_RE.test(t)) z.push("hands");
  if (FEET_RE.test(t)) z.push("feet");
  if (BODY_EXPLICIT_RE.test(t) || (!explicitOnly && BODY_IMPLICIT_RE.test(t))) z.push("body");
  if (z.length === 0 && !explicitOnly && BODY_WEAK_RE.test(t)) return { zones: ["body", "face"], weakOnly: true };
  return { zones: z, weakOnly: false };
}

/**
 * Texte descriptif (nom du produit, type en texte libre, étiquette brute).
 * `isCategoryText` : un texte de CATÉGORIE (« Parfum », « Laque ») peut être
 * lu plus largement qu'un nom marketing (où « sans parfum » est fréquent).
 */
function fromText(raw: string | null | undefined, source: ContextSource, isCategoryText: boolean): Step | null {
  // « The Body Shop » est une marque, pas une zone.
  const t = normText(raw).replace(/\b(the )?body shop\b/g, " ").replace(/\s+/g, " ").trim();
  if (t.length < 2) return null;
  const usage = usageFromText(t);

  if (FRAGRANCE_PRODUCT_RE.test(t)) return step(["none"], "leave_on", source);
  if (isCategoryText && /^(parfums?|fragrance|cologne)$/.test(t)) return step(["none"], "leave_on", source);
  if (ORAL_RE.test(t)) return step(["oral"], "rinse_off", source);
  if (UNDERARM_RE.test(t)) return step(["underarm"], "leave_on", source);
  if (LIP_MAKEUP_RE.test(t)) return step(["lips"], "leave_on", source, { makeup: true });
  if (EYE_MAKEUP_RE.test(t)) return step(["eyes"], "leave_on", source, { makeup: true });

  const hair = hasHairMarker(raw) || (isCategoryText && /\b(laque|coloration|teinture|coiffure)\b/.test(t));
  const { zones: skin, weakOnly } = skinZonesFromText(t, hair);

  if (NAILS_RE.test(t) && skin.length === 0 && !hair) return step(["nails"], usage === "unknown" ? "leave_on" : usage, source);
  if (NONE_OTHER_RE.test(t) && skin.length === 0 && !hair) return step(["none"], usage, source);
  // Multi-zones (« huile sèche corps et cheveux ») : la peau d'abord (règles de
  // contact légitimes), les cheveux en plus.
  if (hair && skin.length > 0) return step([...skin, "hair"], usage, source);
  if (hair) return step(["hair"], usage, source);
  if (weakOnly) return step(skin, usage, source, { certain: false });
  if (skin.length > 0) return step(skin, usage, source);
  if (GENERIC_SKIN_RE.test(t)) return step(["face", "body"], usage, source, { certain: false });
  return usage !== "unknown" ? step([], usage, source) : null;
}

/** Racines de la taxonomie catalogue (cartographie réelle, juil 2026). */
const CATALOG_ROOTS = new Set([
  "soin-du-corps-et-visage", "hygiene-du-corps", "coiffure", "maquillage", "produit-solaire",
  "rasage-et-epilation", "hygiene-dentaire", "manucure-et-pedicure", "parfum", "bien-etre",
  "soin-et-hygiene-bebe", "sante",
]);

/** Slug catalogue exploitable : minuscules/chiffres/tirets, hiérarchique ou racine connue. */
export function isCatalogSlug(c: string | null | undefined): c is string {
  if (!c) return false;
  const s = c.trim();
  if (!/^[a-z0-9-]+(\/[a-z0-9-]+)*$/.test(s)) return false;
  return s.includes("/") || CATALOG_ROOTS.has(s);
}

const MAKEUP_NONE_L2 = new Set([
  "accessoires-de-maquillage", "coffret-de-maquillage", "palette-de-maquillage", "paillettes",
  "encre-et-peinture-corporelle", "maquillage-de-fete", "tatouages-ephemeres",
]);

/** Slug hiérarchique (catalogue curé ou catégorie précise LLM). */
function fromSlug(slug: string, source: ContextSource): Step | null {
  const segs = slug.trim().toLowerCase().split("/").filter(Boolean);
  if (segs.length === 0) return null;
  const root = segs[0];
  const l2 = segs[1] ?? "";
  const l2t = normText(l2);
  const leafT = normText(segs.slice(2).join(" "));
  const restT = `${l2t} ${leafT}`.trim();
  // Usage : la feuille d'abord (« nettoyant-visage/tonique-visage » = sans rinçage).
  const leafUsage = usageFromText(leafT);
  const u: ProductUsage = leafUsage !== "unknown" ? leafUsage : usageFromText(l2t);
  const orLeave = (x: ProductUsage): ProductUsage => (x === "unknown" ? "leave_on" : x);
  const lock = source === "catalog";

  switch (root) {
    case "coiffure":
      return step(["hair"], u, source);
    case "hygiene-du-corps": {
      if (l2.startsWith("deodorant")) return step(["underarm"], "leave_on", source);
      if (l2 === "hygiene-intime" || l2 === "papier-toilette-humide") return step(["none"], u, source);
      if (l2 === "anti-poux") return step(["hair"], u, source);
      if (/\bmains\b/.test(restT)) return step(["hands"], "rinse_off", source);
      const bath = l2 === "produit-de-bain" || l2 === "savon" || l2 === "gel-douche";
      return step(["body"], bath && u === "unknown" ? "rinse_off" : u, source);
    }
    case "soin-du-corps-et-visage": {
      const leaf = skinZonesFromText(leafT);
      const found = leaf.zones.length > 0 && !leaf.weakOnly ? leaf : skinZonesFromText(l2t);
      if (found.zones.length > 0 && !found.weakOnly) return step(found.zones, orLeave(u), source);
      if (/\b(apaisants?|thermale)\b/.test(restT)) return step(["face"], orLeave(u), source);
      return step(["face", "body"], orLeave(u), source, { certain: false, lockSkinFamily: lock });
    }
    case "maquillage": {
      if (l2 === "maquillage-a-levres") return step(["lips"], "leave_on", source, { makeup: true });
      if (l2 === "maquillage-des-yeux") return step(["eyes"], "leave_on", source, { makeup: true });
      if (MAKEUP_NONE_L2.has(l2)) return step(["none"], "leave_on", source);
      if (l2 === "demaquillant") {
        const z = skinZonesFromText(leafT).zones;
        return step(z.includes("eyes") ? ["eyes"] : ["face"], "rinse_off", source);
      }
      if (/\b(ongles?|vernis)\b/.test(restT)) return step(["nails"], "leave_on", source);
      return step(["face"], "leave_on", source);
    }
    case "produit-solaire": {
      if (/\b(visage|face)\b/.test(restT)) return step(["face"], "leave_on", source);
      return step(["body", "face"], "leave_on", source, { certain: false, lockSkinFamily: lock });
    }
    case "rasage-et-epilation": {
      // Décisions historiques conservées (hors profil) : barbe et matériel.
      if (l2 === "soin-de-la-barbe" || l2 === "lames-de-rasoir" || l2.startsWith("rasoir")) {
        return step(["none"], "leave_on", source);
      }
      if (l2 === "apres-rasage") return step(["face"], "leave_on", source);
      if (l2 === "mousse-et-gel-de-rasage" || l2 === "huile-de-rasage") return step(["face"], "rinse_off", source);
      return step(["body"], u, source);
    }
    case "hygiene-dentaire":
      return step(["oral"], "rinse_off", source);
    case "manucure-et-pedicure": {
      if (/\bpieds?\b/.test(restT)) return step(["feet"], orLeave(u), source);
      if (/\bmains\b/.test(restT)) return step(["hands"], orLeave(u), source);
      return step(["nails"], orLeave(u), source);
    }
    case "parfum":
      return step(["none"], "leave_on", source);
    case "bien-etre":
      return l2 === "massage" ? step(["body"], "leave_on", source) : step(["none"], u, source);
    case "soin-et-hygiene-bebe": // produit pour bébé : le profil adulte ne s'applique pas
    case "sante":
      return step(["none"], u, source);
    default:
      return null;
  }
}

/** Catégorie grossière de l'analyseur (LLM sur les 5 premiers ingrédients). */
function fromEnum(v: string): Step | null {
  switch (v.trim().toLowerCase()) {
    case "shampooing":
      return step(["hair"], "rinse_off", "category");
    case "apres_shampooing":
      return step(["hair"], "unknown", "category");
    // Visage vs corps deviné sur 5 ingrédients : NON fiable → zone incertaine.
    case "creme_visage":
      return step(["face", "body"], "leave_on", "category", { certain: false });
    case "creme_corps":
      return step(["body", "face"], "unknown", "category", { certain: false });
    case "nettoyant_visage":
      return step(["face", "body"], "rinse_off", "category", { certain: false });
    case "solaire":
      return step(["body", "face"], "leave_on", "category", { certain: false });
    case "maquillage":
      return step(["face"], "leave_on", "category");
    case "deodorant":
      return step(["underarm"], "leave_on", "category");
    case "parfum":
      return step(["none"], "leave_on", "category");
    default:
      return null;
  }
}

// Indices ingrédients (dernier recours).
const ORAL_INCI_RE = /\b(sodium fluoride|sodium monofluorophosphate|stannous fluoride|amine fluoride|olaflur)\b/;
const UNDERARM_INCI_RE = /\balumin(i)?um (chlorohydrate|sesquichlorohydrate|zirconium)/;
/** Conditionneurs quasi exclusivement capillaires. */
const HAIR_STRONG_INCI_RE =
  /\b(amodimethicone|behentrimonium|stearamidopropyl dimethylamine|brassicamidopropyl dimethylamine|piroctone olamine|zinc pyrithione|climbazole|quaternium 80|bis aminopropyl dimethicone|dicetyldimonium)\b/;
/** Conditionneurs aussi présents dans des gels douche : ne comptent qu'à deux, avec du cetrimonium. */
const HAIR_WEAK_INCI_RE = /\b(cetrimonium|polyquaternium|hydroxypropyltrimonium|quaternium)\b/;
/** Base lavante (tensioactifs) ou savon : produit rincé si elle ouvre la formule. */
const WASH_BASE_INCI_RE =
  /\b(sodium laureth sulfate|sodium lauryl sulfate|ammonium laureth sulfate|ammonium lauryl sulfate|sodium coco sulfate|sodium myreth sulfate|cocamidopropyl betaine|coco betaine|lauryl betaine|decyl glucoside|coco glucoside|lauryl glucoside|sodium cocoyl isethionate|sodium lauroyl methyl isethionate|sodium lauroyl sarcosinate|disodium laureth sulfosuccinate|sodium cocoamphoacetate|disodium cocoamphodiacetate|sodium c14 16 olefin sulfonate|sodium cocoyl glutamate|sodium methyl cocoyl taurate|sodium lauroyl glutamate|potassium cocoate|sodium cocoate|sodium palmate|sodium palm kernelate|sodium olivate|sodium tallowate)\b/;

function fromIngredients(items: ProductContextInput["items"]): Step | null {
  const names = (items ?? [])
    .map((i) => normText(i.name ?? i.input ?? ""))
    .filter((n) => n.length > 0);
  if (names.length === 0) return null;

  const washFirst = names.slice(0, 5).some((n) => WASH_BASE_INCI_RE.test(n));
  const usage: ProductUsage = washFirst ? "rinse_off" : "unknown";

  if (names.some((n) => ORAL_INCI_RE.test(n))) return step(["oral"], "rinse_off", "ingredients");
  if (names.some((n) => UNDERARM_INCI_RE.test(n))) return step(["underarm"], "leave_on", "ingredients");
  if (names.includes("nitrocellulose") && names.some((n) => /\b(butyl|ethyl) acetate\b/.test(n))) {
    return step(["nails"], "leave_on", "ingredients");
  }
  const strong = names.filter((n) => HAIR_STRONG_INCI_RE.test(n)).length;
  const weak = names.filter((n) => HAIR_WEAK_INCI_RE.test(n));
  if (strong >= 1 || (weak.length >= 2 && weak.some((n) => n.includes("cetrimonium")))) {
    return step(["hair"], usage, "ingredients");
  }
  return usage !== "unknown" ? step([], usage, "ingredients") : null;
}

const NONE_CONTEXT: ProductContext = {
  axis: "none",
  zones: ["none"],
  usage: "unknown",
  source: "none",
  zoneCertain: true,
  makeup: false,
};

const isSkinOnly = (zones: readonly ProductAxis[]) =>
  zones.length > 0 && zones.every((z) => SKIN_CONTACT_AXES.includes(z));

/** Premier slug catalogue exploitable parmi la catégorie curée et les catégories stockées. */
export function pickCatalogSlug(input: Pick<ProductContextInput, "catalogCategory" | "categories">): string | null {
  const all = [input.catalogCategory, ...(input.categories ?? [])];
  for (const c of all) if (isCatalogSlug(c)) return c.trim();
  return null;
}

/**
 * Résout la zone et l'usage d'un produit. Toujours une réponse : à défaut de
 * tout signal, `{ axis: "none" }` (produit non rattaché au profil).
 */
export function resolveProductContext(input: ProductContextInput): ProductContext {
  const catalogSlug = pickCatalogSlug(input);
  const textCategories = [input.catalogCategory, ...(input.categories ?? [])]
    .filter((c): c is string => typeof c === "string" && c.trim().length > 0 && !isCatalogSlug(c));

  const steps: (Step | null)[] = [
    catalogSlug ? fromSlug(catalogSlug, "catalog") : null,
    fromText(input.productName, "name", false),
    fromText(input.productType, "category", true),
    isCatalogSlug(input.categoryPrecise) ? fromSlug(input.categoryPrecise, "category") : null,
    ...textCategories.map((c) => fromEnum(c) ?? fromText(c, "category", true)),
    fromIngredients(input.items),
  ];
  const valid = steps.filter((s): s is Step => s !== null);

  let chosen: Step | null = null;
  let uncertain: Step | null = null;
  for (const s of valid) {
    if (s.zones.length === 0) continue; // étape « usage seul »
    if (s.certain) {
      // Famille peau verrouillée par le catalogue : un signal plus faible peut
      // préciser visage/corps, jamais rebasculer en cheveux ou hors profil.
      if (uncertain?.lockSkinFamily && !isSkinOnly(s.zones)) continue;
      chosen = s;
      break;
    }
    if (!uncertain) uncertain = s;
  }
  const picked = chosen ?? uncertain;
  if (!picked) {
    const usage = valid.find((s) => s.usage !== "unknown")?.usage ?? "unknown";
    return { ...NONE_CONTEXT, usage };
  }
  // Usage : celui de l'étape retenue, sinon le premier connu dans l'ordre des signaux.
  const usage = picked.usage !== "unknown"
    ? picked.usage
    : valid.find((s) => s.usage !== "unknown")?.usage ?? "unknown";
  return {
    axis: picked.zones[0],
    zones: [...new Set(picked.zones)],
    usage,
    source: picked.source,
    zoneCertain: picked.certain,
    makeup: Boolean(picked.makeup),
  };
}

// ── Axe de PROFIL (gating « profil incomplet ») ──────────────────────────────
export type ProfileAxisLike = "skin" | "hair" | "none";

/**
 * Axes du profil concernés, axe principal en tête. Parité avec l'ancien
 * `categoryToAxis` : maquillage lèvres/yeux, déo, dentaire, ongles = hors profil.
 */
export function profileAxesOf(ctx: ZoneContextLike & { makeup?: boolean }): ("skin" | "hair")[] {
  const zones = zonesOf(ctx);
  const skin = zones.some((z) =>
    z === "face" || z === "body" || z === "hands" || z === "feet" ||
    ((z === "lips" || z === "eyes") && !ctx.makeup)
  );
  const hair = zones.includes("hair");
  const out: ("skin" | "hair")[] = [];
  if (ctx.axis === "hair") {
    if (hair) out.push("hair");
    if (skin) out.push("skin");
  } else {
    if (skin) out.push("skin");
    if (hair) out.push("hair");
  }
  return out;
}

export function profileAxisOf(ctx: ZoneContextLike & { makeup?: boolean }): ProfileAxisLike {
  return profileAxesOf(ctx)[0] ?? "none";
}

// ── Libellés (prompts) et clé de cache ───────────────────────────────────────
const ZONE_LABEL: Record<ProductAxis, string> = {
  hair: "cheveux et cuir chevelu",
  face: "visage",
  body: "corps",
  lips: "lèvres",
  eyes: "contour des yeux",
  hands: "mains",
  feet: "pieds",
  oral: "bouche et dents",
  underarm: "aisselles",
  nails: "ongles",
  none: "non déterminée",
};

export function describeZones(ctx: ZoneContextLike & { zoneCertain?: boolean }): string {
  const label = zonesOf(ctx).map((z) => ZONE_LABEL[z]).join(" + ");
  return ctx.zoneCertain === false ? `${label} (zone exacte non précisée)` : label;
}

export function describeUsage(usage: ProductUsage): string {
  if (usage === "rinse_off") return "produit RINCÉ ou retiré juste après application (contact bref)";
  if (usage === "leave_on") return "produit SANS RINÇAGE (reste en contact prolongé)";
  return "usage non précisé (considère-le comme un produit sans rinçage)";
}

/** Fragment stable pour les clés de cache / signatures (ex. « hair|rinse_off »). */
export function zoneKey(ctx: ZoneContextLike | null | undefined): string {
  if (!ctx) return "nozone";
  return `${[...zonesOf(ctx)].join("+")}|${ctx.usage}`;
}
