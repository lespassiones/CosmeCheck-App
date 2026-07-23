/**
 * Résolution de catégorie pour `routine-smart-suggest` — logique PURE, sans
 * dépendance Deno, testable en Jest (cf. lib/__tests__/categoryResolve.test.ts).
 *
 * POURQUOI CE MODULE (bug « suggestion contredit la comparaison », juil 2026) :
 * le moteur choisissait la catégorie d'un produit via une classification par
 * SIMILARITÉ DE NOM (`cosme_check_classify_product_category`). Celle-ci est
 * structurellement peu fiable sur les noms marketing :
 *   - « Pschitt Magique NOUVELLE PEAU » (un nettoyant) → `gommage-visage` (3 votes),
 *     d'où une alternative EXFOLIANTE proposée pour remplacer un nettoyant hydratant ;
 *   - « CeraVe CRÈME HYDRATANTE Visage » → `creme-solaire` (12 votes, faux).
 *
 * Nouvelle hiérarchie de signaux (du plus fiable au moins fiable) :
 *   1. EAN présent dans le catalogue → catégorie catalogue (match produit réel,
 *      DANS la taxonomie du catalogue → directement exploitable).
 *   2. `product_type` (lecture STRUCTURÉE de l'analyseur, ex. « Nettoyant visage »)
 *      → mappé par mots-clés vers un préfixe de taxonomie CATALOGUE L1/L2. Robuste
 *      aux noms marketing car il décrit la FONCTION, pas le nom commercial.
 *   3. `category_precise` — DÉPRIORITÉ : elle vient de la taxonomie de l'ANALYSEUR
 *      (ex. `soin.../nettoyant/nettoyant-visage`, `soin.../hydratation/lait-corporel`)
 *      qui NE COÏNCIDE PAS avec celle du catalogue (`nettoyant-visage`, `creme-hydratante`).
 *      Utilisée en catalogue elle starve presque toujours → simple filet, jamais
 *      prioritaire sur `product_type`.
 *   4. Classification par nom — DERNIER recours, et UNIQUEMENT si le vote dépasse
 *      un seuil de confiance (sinon on S'ABSTIENT : pas de suggestion plutôt
 *      qu'une reco fausse).
 *   5. Rien de fiable → null → aucune suggestion pour ce produit.
 */

/**
 * Seuil de confiance de la classification par nom. Calibré sur données prod
 * (juil 2026) : les classifications CORRECTES à fort signal obtiennent 17-37
 * votes ; les fausses (noms marketing) 1-3 ; la zone grise 8-12 contient des
 * faux (ex. CeraVe → solaire à 12). On exige donc ≥ 15 : on n'accepte que les
 * classifications par nom manifestement confiantes, sinon on s'abstient (le
 * `product_type` couvre déjà l'immense majorité des cas fiables).
 */
export const MIN_CLASSIFY_VOTES = 15;

/** Enlève les diacritiques + minuscule (comparaison insensible casse/accents). */
const COMBINING = new RegExp("[\\u0300-\\u036f]", "g");
export function normalizeType(v: string | null | undefined): string {
  return (v ?? "").normalize("NFD").replace(COMBINING, "").toLowerCase().trim();
}

/**
 * Règles ORDONNÉES product_type → préfixe de taxonomie `l1[/l2]/%`.
 *
 * L'ORDRE EST CRITIQUE : les règles les plus spécifiques d'abord, pour éviter les
 * faux positifs du fourre-tout « crème/soin ». Exemples voulus :
 *   - « Crème solaire » → solaire (avant le fourre-tout crème) ;
 *   - « Crème pour les mains » → mains (avant crème) ;
 *   - « Eau micellaire exfoliante » → nettoyant-visage (le nettoyant PRIME sur
 *     l'exfoliant : c'est une eau micellaire, pas un gommage dédié) ;
 *   - « Gommage visage » (sans mot nettoyant) → masque-et-gommage.
 *
 * Chaque cible est un préfixe SANS le `/%` final (ajouté par le mappeur).
 */
const RULES: { re: RegExp; target: string }[] = [
  // ── Hygiène dentaire ───────────────────────────────────────────────────────
  { re: /bain de bouche|mouthwash|haleine|rince bouche/, target: "hygiene-dentaire/bain-de-bouche" },
  { re: /dentifrice|toothpaste|dentaire|blanchiment dent|dents? blanches?/, target: "hygiene-dentaire/dentifrice-adulte" },

  // ── Ongles ───────────────────────────────────────────────────────────────
  { re: /vernis|nail polish|dissolvant|base ongle|top coat/, target: "manucure-et-pedicure/vernis-et-base-ongles" },
  { re: /ongles?|cuticule|durcisseur/, target: "manucure-et-pedicure/soin-et-traitement-des-ongles" },

  // ── Déodorant ──────────────────────────────────────────────────────────────
  { re: /deodorant|anti-?transpirant|anti transpirant|antiperspirant/, target: "hygiene-du-corps/deodorant" },

  // ── Parfum (AVANT cheveux : « brume parfumée corps & cheveux » = parfum) ─────
  { re: /parfum|eau de toilette|eau de parfum|cologne|brume parfum|fragrance|body mist|brume corps/, target: "parfum" },

  // ── Cheveux / coiffure ───────────────────────────────────────────────────
  { re: /coloration|teinture/, target: "coiffure/coloration-capillaire" },
  { re: /coiffant|laque|gel coiffant|cire coiffante|mousse coiffante|spray coiffant|fixation/, target: "coiffure/produits-coiffants" },
  // Après-shampooing / soin capillaire à laisser poser — AVANT la règle shampooing
  // (« après-shampooing » contient « shampoo » et serait sinon pris pour un shampooing).
  { re: /apres-?shampo|apres shampo|conditioner|conditionneur|demelant|masque capillaire|soin capillaire|leave.?in/, target: "coiffure/soin-capillaire" },
  { re: /shampo|shampoo/, target: "coiffure/shampooing" },
  // Générique cheveux — APRÈS shampooing (« shampooing pour cheveux » = shampooing).
  { re: /capillaire|cheveux|boucles?|sans rincage|defrisant|permanente/, target: "coiffure/soin-capillaire" },

  // ── Solaire ─────────────────────────────────────────────────────────────
  { re: /autobronzant|self.?tan|bronzage/, target: "produit-solaire/autobronzant" },
  { re: /apres-?soleil|apres soleil|after.?sun/, target: "produit-solaire/apres-soleil" },
  { re: /solaire|sun.?screen|spf|protection soleil|ecran solaire/, target: "produit-solaire/creme-solaire" },

  // ── Rasage / épilation ───────────────────────────────────────────────────
  { re: /apres-?rasage|apres rasage|after.?shave|baume.*rasage/, target: "rasage-et-epilation/apres-rasage" },
  { re: /barbe|beard/, target: "rasage-et-epilation/soin-de-la-barbe" },
  { re: /rasage|shaving|rasoir|razor|mousse a raser|gel a raser/, target: "rasage-et-epilation/mousse-et-gel-de-rasage" },
  { re: /epilation|cire|wax/, target: "rasage-et-epilation/epilation-et-cire" },

  // ── Hygiène intime ─────────────────────────────────────────────────────────
  { re: /intime|intimate/, target: "hygiene-du-corps/hygiene-intime" },

  // ── Lavant corps (AVANT nettoyant visage : « gel lavant » corps ≠ visage) ──
  { re: /gel douche|gel-douche|shower gel|body wash|huile de douche|creme de douche|creme lavante|bain moussant|produit de bain|savon|soap|pain surgras|syndet|lavant/, target: "hygiene-du-corps/produit-de-bain" },

  // ── Nettoyant visage (AVANT gommage : le nettoyant/micellaire prime) ───────
  { re: /nettoyant|cleanser|cleansing|eau micellaire|micellaire|demaquill|makeup remover|mousse nettoyante|gelee nettoyante|gel nettoyant|nettoyant en poudre|lait nettoyant|cleansing milk/, target: "soin-du-corps-et-visage/nettoyant-visage" },

  // ── Gommage / masque visage ────────────────────────────────────────────────
  { re: /gommage|exfoliant|exfoliating|scrub|peeling|masque|mask|argile|ghassoul|clay/, target: "soin-du-corps-et-visage/masque-et-gommage" },

  // ── Zones ciblées visage/corps ─────────────────────────────────────────────
  { re: /levres?|lip ?balm|baume a levres|lipbalm/, target: "soin-du-corps-et-visage/soin-des-levres" },
  { re: /contour des yeux|contour yeux|soin des yeux|eye ?cream|eye ?contour|yeux/, target: "soin-du-corps-et-visage/soin-des-yeux" },
  { re: /mains?|hand ?cream|hand ?balm/, target: "soin-du-corps-et-visage/soin-des-mains" },
  { re: /pieds?|jambes?|foot|talons?/, target: "soin-du-corps-et-visage/soin-des-pieds-et-jambes" },
  { re: /acne|imperfection|bouton|blemish|point noir/, target: "soin-du-corps-et-visage/soin-acne-et-imperfection" },
  { re: /cellulite|minceur|slimming|amincissant/, target: "soin-du-corps-et-visage/soin-anti-cellulite" },
  { re: /vergeture|stretch.?mark/, target: "soin-du-corps-et-visage/soin-anti-vergetures" },
  { re: /eau thermale|brume|thermal|mist/, target: "soin-du-corps-et-visage/eaux-thermales-brumes" },

  // ── Soin anti-âge / sérum (AVANT le fourre-tout crème) ─────────────────────
  { re: /anti-?age|anti age|anti-?ride|anti ride|rides|serum|bakuchiol|retinol|vitamine c|firming|raffermissant|eclat|eclairciss|brightening|anti-?tache|taches?/, target: "soin-du-corps-et-visage/soin-anti-age" },

  // ── Corps : lait / baume / beurre corporel ─────────────────────────────────
  { re: /corporel|corps|body ?lotion|body ?milk|body ?butter|beurre|relipidant|emollient/, target: "soin-du-corps-et-visage/creme-hydratante" },

  // ── Maquillage ─────────────────────────────────────────────────────────────
  { re: /maquillage|fond de teint|foundation|mascara|rouge a levres|lipstick|fard|eyeliner|correcteur|concealer|blush|highlighter|palette|khol|crayon/, target: "maquillage" },

  // ── Huile essentielle ────────────────────────────────────────────────────
  { re: /huile essentielle|essential oil/, target: "bien-etre/huile-essentielle" },

  // ── Fourre-tout hydratation visage/corps (crème, baume, sérum, gelée…) ─────
  { re: /creme|cream|hydratant|moisturi|gel-?creme|fluide|gelee|pommade|lotion|baume|soin visage|soin du visage|face oil|huile.*visage|jour|nuit/, target: "soin-du-corps-et-visage/creme-hydratante" },
];

/**
 * Mappe un `product_type` (texte libre de l'analyseur) vers un préfixe de
 * taxonomie `l1[/l2]/%` utilisable par `cosme_check_alternatives_by_category_prefix`
 * (qui filtre `category LIKE p_prefix`). `null` si aucun mot-clé ne matche.
 */
export function productTypeToCategoryPrefix(productType: string | null | undefined): string | null {
  const t = normalizeType(productType);
  if (t.length < 3) return null;
  for (const rule of RULES) {
    if (rule.re.test(t)) return `${rule.target}/%`;
  }
  return null;
}

export type CategorySource = "ean-catalog" | "category-precise" | "product-type" | "name-classify";
export type CategoryPlan = { value: string; isPrefix: boolean; source: CategorySource };

/**
 * Décide la catégorie à utiliser pour chercher des alternatives, à partir des
 * signaux déjà collectés. Pure → l'appelant orchestre les appels DB (et n'appelle
 * la classification par nom QUE si les signaux plus fiables sont absents).
 *
 * `isPrefix` = true seulement pour le mapping product_type (préfixe `l1/l2/%`,
 * recherche large). Les autres sources renvoient une feuille exacte.
 * Renvoie `null` quand aucun signal fiable n'existe → le produit est ignoré
 * (abstention volontaire plutôt qu'une devinette).
 */
export function resolveCategoryPlan(signals: {
  eanCatalogCategory: string | null;
  categoryPrecise: string | null;
  productTypePrefix: string | null;
  classifyCategory: string | null;
  classifyVotes: number;
}): CategoryPlan | null {
  const eanCat = signals.eanCatalogCategory?.trim();
  if (eanCat) return { value: eanCat, isPrefix: false, source: "ean-catalog" };

  // product_type AVANT category_precise : category_precise vit dans une autre
  // taxonomie que le catalogue (cf. entête) et starve à la recherche.
  const ptPrefix = signals.productTypePrefix?.trim();
  if (ptPrefix) return { value: ptPrefix, isPrefix: true, source: "product-type" };

  const precise = signals.categoryPrecise?.trim();
  if (precise) return { value: precise, isPrefix: false, source: "category-precise" };

  const classifyCat = signals.classifyCategory?.trim();
  if (classifyCat && signals.classifyVotes >= MIN_CLASSIFY_VOTES) {
    return { value: classifyCat, isPrefix: false, source: "name-classify" };
  }

  return null;
}
