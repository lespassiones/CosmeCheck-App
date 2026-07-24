/**
 * productTypeCategory — résolution ROBUSTE de la catégorie servant à chercher des
 * « alternatives » (produits similaires) sur l'écran d'analyse.
 *
 * POURQUOI CE MODULE (bug bêta « alternatives sans rapport avec le visage », juil 2026) :
 * un nettoyant visage (« Gel de Limpeza Facial CeraVe ») affichait comme alternatives
 * un savon pour les mains, un gel gingival bébé, un gel pour les jambes, des lingettes…
 * Cause : la colonne `catalog.category` MÉLANGE deux taxonomies :
 *   - une taxonomie propre, hiérarchique (95 % des produits) :
 *       « soin-du-corps-et-visage/nettoyant-visage/gel-nettoyant-visage »
 *   - des catégories POUBELLE mono-token / labels bruts (5 % ≈ 23 k produits) :
 *       « gel », « coiffure », « Crème solaire adulte », « sunscreen », null…
 * Le produit fautif était rangé dans le bucket « gel » → l'appariement exact par
 * catégorie renvoyait TOUT ce qui contient « gel », toutes fonctions confondues.
 *
 * STRATÉGIE (miroir de `routine-smart-suggest/categoryResolve.ts`, du plus fiable
 * au moins fiable), qui garantit qu'on ne pivote JAMAIS sur un bucket dénué de sens :
 *   1. Catégorie catalogue SI c'est un slug SPÉCIFIQUE (≥ 2 niveaux `a/b`) → match EXACT.
 *      Les buckets poubelle (mono-token, labels, null) sont REJETÉS.
 *   2. `product_type` (fonction décrite par l'analyseur) → préfixe de taxonomie `l1/l2/%`
 *      → recherche LIKE (large mais cohérente). Robuste aux noms marketing.
 *   3. Nom du produit → mêmes règles, mais UNIQUEMENT sur mot-clé fonctionnel fort
 *      (jamais le fourre-tout « crème ») → dernier recours pour les produits sans
 *      signal fiable (ex. produit étranger hors catalogue, product_type null).
 *   4. Aucun signal fiable → ABSTENTION (`null`) : on préfère n'afficher AUCUNE
 *      alternative plutôt qu'une reco hors-sujet. C'est la garantie « plus jamais ».
 *
 * Tout est PUR (aucune dépendance RN/Deno) → testable en Jest
 * (lib/__tests__/productTypeCategory.test.ts). Les RULES sont un MIROIR (élargi
 * au multilingue) de `supabase/functions/routine-smart-suggest/categoryResolve.ts` :
 * garder les deux cohérents lors d'un ajout de catégorie.
 */

/** Enlève les diacritiques + minuscule (comparaison insensible casse/accents). */
const COMBINING = /[̀-ͯ]/g
export function normalizeType(v: string | null | undefined): string {
  return (v ?? '').normalize('NFD').replace(COMBINING, '').toLowerCase().trim()
}

/**
 * Une catégorie est « spécifique » (utilisable en match EXACT pour les
 * alternatives) SEULEMENT si c'est un slug hiérarchique d'au moins 2 niveaux
 * (« a/b » ou « a/b/c »). Ce simple test élimine tous les buckets poubelle
 * observés en prod : mono-token (« gel », « coiffure », « sunscreen »), labels
 * bruts (« Crème solaire adulte »), top-level seul (« soin-du-corps-et-visage »),
 * et null — tout en gardant les 95 % de produits correctement catégorisés.
 */
export function isSpecificCategorySlug(category: string | null | undefined): boolean {
  if (!category) return false
  const c = category.trim()
  // Un slug propre ne contient ni espace ni majuscule ; il a ≥ 1 séparateur `/`
  // avec des segments non vides de part et d'autre.
  if (c.includes(' ')) return false
  const parts = c.split('/').filter((s) => s.length > 0)
  return parts.length >= 2
}

/**
 * Règles ORDONNÉES nom/product_type → préfixe de taxonomie `l1[/l2]`.
 * MIROIR de `supabase/functions/routine-smart-suggest/categoryResolve.ts` (RULES) :
 * garder les deux synchronisés (le test cross-vérifie l'égalité sur une batterie).
 *
 * L'ORDRE EST CRITIQUE : règles les plus spécifiques d'abord (sinon le fourre-tout
 * « crème/soin » capture tout). `catchAll: true` marque les règles trop génériques
 * pour servir de classification par NOM (utilisées seulement via product_type).
 */
interface Rule {
  re: RegExp
  target: string
  /** Trop générique pour classer un NOM marketing (fourre-tout crème/soin). */
  catchAll?: boolean
}

const RULES: Rule[] = [
  // ── Hygiène dentaire ───────────────────────────────────────────────────────
  { re: /bain de bouche|mouthwash|haleine|rince bouche/, target: 'hygiene-dentaire/bain-de-bouche' },
  { re: /dentifrice|toothpaste|dentaire|blanchiment dent|dents? blanches?/, target: 'hygiene-dentaire/dentifrice-adulte' },

  // ── Ongles ───────────────────────────────────────────────────────────────
  { re: /vernis|nail polish|dissolvant|base ongle|top coat/, target: 'manucure-et-pedicure/vernis-et-base-ongles' },
  { re: /ongles?|cuticule|durcisseur/, target: 'manucure-et-pedicure/soin-et-traitement-des-ongles' },

  // ── Déodorant ──────────────────────────────────────────────────────────────
  { re: /deodorant|anti-?transpirant|anti transpirant|antiperspirant/, target: 'hygiene-du-corps/deodorant' },

  // ── Parfum (AVANT cheveux : « brume parfumée corps & cheveux » = parfum) ─────
  { re: /parfum|eau de toilette|eau de parfum|cologne|brume parfum|fragrance|body mist|brume corps/, target: 'parfum' },

  // ── Cheveux / coiffure ───────────────────────────────────────────────────
  { re: /coloration|teinture/, target: 'coiffure/coloration-capillaire' },
  { re: /coiffant|laque|gel coiffant|cire coiffante|mousse coiffante|spray coiffant|fixation/, target: 'coiffure/produits-coiffants' },
  { re: /apres-?shampo|apres shampo|conditioner|conditionneur|demelant|masque capillaire|soin capillaire|leave.?in|hair ?mask|hair ?oil|hair ?serum|hair ?repair/, target: 'coiffure/soin-capillaire' },
  { re: /shampo|shampoo/, target: 'coiffure/shampooing' },
  { re: /capillaire|cheveux|\bhair\b|boucles?|sans rincage|defrisant|permanente/, target: 'coiffure/soin-capillaire' },

  // ── Solaire ─────────────────────────────────────────────────────────────
  { re: /autobronzant|self.?tan|bronzage/, target: 'produit-solaire/autobronzant' },
  { re: /apres-?soleil|apres soleil|after.?sun/, target: 'produit-solaire/apres-soleil' },
  { re: /solaire|sun.?screen|spf|protection soleil|ecran solaire|protetor solar|protector solar/, target: 'produit-solaire/creme-solaire' },

  // ── Rasage / épilation ───────────────────────────────────────────────────
  { re: /apres-?rasage|apres rasage|after.?shave|baume.*rasage/, target: 'rasage-et-epilation/apres-rasage' },
  { re: /barbe|beard/, target: 'rasage-et-epilation/soin-de-la-barbe' },
  { re: /rasage|shaving|rasoir|razor|mousse a raser|gel a raser/, target: 'rasage-et-epilation/mousse-et-gel-de-rasage' },
  { re: /epilation|cire|wax/, target: 'rasage-et-epilation/epilation-et-cire' },

  // ── Hygiène intime ─────────────────────────────────────────────────────────
  { re: /intime|intimate|intima/, target: 'hygiene-du-corps/hygiene-intime' },

  // ── Lavant corps (AVANT nettoyant visage : « gel lavant » corps ≠ visage) ──
  { re: /gel douche|gel-douche|shower gel|body wash|huile de douche|creme de douche|creme lavante|bain moussant|produit de bain|savon|soap|jabon|sabonete|pain surgras|syndet|lavant mains|gel lavant/, target: 'hygiene-du-corps/produit-de-bain' },

  // ── Nettoyant visage (AVANT gommage : le nettoyant/micellaire prime) ───────
  // Termes multilingues ajoutés (juil 2026) : « limpeza/limpiador/facial cleanser »
  // pour rattraper les produits étrangers hors catalogue (ex. CeraVe « Gel de
  // Limpeza Facial » qui n'avait ni catégorie propre ni product_type).
  { re: /nettoyant|cleanser|cleansing|face wash|facial wash|eau micellaire|micellaire|micelar|demaquill|makeup remover|mousse nettoyante|gelee nettoyante|gel nettoyant|nettoyant en poudre|lait nettoyant|cleansing milk|limpeza facial|gel de limpeza|limpiador facial|nettoyant visage/, target: 'soin-du-corps-et-visage/nettoyant-visage' },

  // ── Gommage / masque visage ────────────────────────────────────────────────
  { re: /gommage|exfoliant|exfoliating|scrub|peeling|masque|mask|argile|ghassoul|clay/, target: 'soin-du-corps-et-visage/masque-et-gommage' },

  // ── Zones ciblées visage/corps ─────────────────────────────────────────────
  { re: /levres?|lip ?balm|baume a levres|lipbalm/, target: 'soin-du-corps-et-visage/soin-des-levres' },
  { re: /contour des yeux|contour yeux|soin des yeux|eye ?cream|eye ?contour|\byeux\b/, target: 'soin-du-corps-et-visage/soin-des-yeux' },
  { re: /mains?|hand ?cream|hand ?balm/, target: 'soin-du-corps-et-visage/soin-des-mains' },
  { re: /pieds?|jambes?|foot|talons?/, target: 'soin-du-corps-et-visage/soin-des-pieds-et-jambes' },
  { re: /acne|imperfection|bouton|blemish|point noir/, target: 'soin-du-corps-et-visage/soin-acne-et-imperfection' },
  { re: /cellulite|minceur|slimming|amincissant/, target: 'soin-du-corps-et-visage/soin-anti-cellulite' },
  { re: /vergeture|stretch.?mark/, target: 'soin-du-corps-et-visage/soin-anti-vergetures' },
  { re: /eau thermale|thermal/, target: 'soin-du-corps-et-visage/eaux-thermales-brumes' },

  // ── Soin anti-âge / sérum (AVANT le fourre-tout crème) ─────────────────────
  { re: /anti-?age|anti age|anti-?ride|anti ride|rides|serum|bakuchiol|retinol|vitamine c|firming|raffermissant|eclat|eclairciss|brightening|anti-?tache|taches?/, target: 'soin-du-corps-et-visage/soin-anti-age' },

  // ── Corps : lait / baume / beurre corporel ─────────────────────────────────
  { re: /corporel|corps|body ?lotion|body ?milk|body ?butter|beurre|relipidant|emollient/, target: 'soin-du-corps-et-visage/creme-hydratante', catchAll: true },

  // ── Maquillage ─────────────────────────────────────────────────────────────
  { re: /maquillage|fond de teint|foundation|mascara|rouge a levres|lipstick|fard|eyeliner|correcteur|concealer|blush|highlighter|palette|khol|crayon/, target: 'maquillage' },

  // ── Huile essentielle ────────────────────────────────────────────────────
  { re: /huile essentielle|essential oil/, target: 'bien-etre/huile-essentielle' },

  // ── Fourre-tout hydratation visage/corps (crème, baume, sérum, gelée…) ─────
  { re: /creme|cream|hydratant|moisturi|gel-?creme|fluide|gelee|pommade|lotion|baume|soin visage|soin du visage|face oil|huile.*visage|jour|nuit/, target: 'soin-du-corps-et-visage/creme-hydratante', catchAll: true },
]

/**
 * Mappe un `product_type` (texte libre de l'analyseur, ex. « Nettoyant visage »)
 * vers un préfixe `l1[/l2]/%` (LIKE). `null` si aucun mot-clé ne matche.
 */
export function productTypeToCategoryPrefix(productType: string | null | undefined): string | null {
  const t = normalizeType(productType)
  if (t.length < 3) return null
  for (const rule of RULES) {
    if (rule.re.test(t)) return `${rule.target}/%`
  }
  return null
}

/**
 * Classe un NOM de produit vers un préfixe `l1[/l2]/%` — DERNIER recours quand ni
 * la catégorie catalogue ni le product_type ne sont exploitables.
 *
 * Plus prudent que `productTypeToCategoryPrefix` : les règles FOURRE-TOUT
 * (`catchAll`) sont IGNORÉES, car un nom marketing (« Nouvelle Peau », « Éclat
 * Divin »…) sans mot-clé fonctionnel tomberait à tort dans « crème hydratante ».
 * Sans mot-clé fort → `null` (abstention).
 */
export function productNameToCategoryPrefix(name: string | null | undefined): string | null {
  const t = normalizeType(name)
  if (t.length < 3) return null
  for (const rule of RULES) {
    if (rule.catchAll) continue
    if (rule.re.test(t)) return `${rule.target}/%`
  }
  return null
}

/**
 * Feuille CANONIQUE (catégorie 3 niveaux réelle) pour chaque préfixe `l1[/l2]` des
 * RULES — cible de la RE-CATÉGORISATION des ~23 k produits mal rangés (scripts/
 * recategorize-catalog.ts). Choisie = feuille MODALE existante du catalogue quand
 * elle existe ; INVENTÉE (convention) pour les familles sans taxonomie propre
 * (solaire, dentaire, huile essentielle : elles ne vivaient QUE dans des buckets
 * poubelle → on les consolide en une feuille cohérente). `null` = on s'abstient
 * de re-ranger (pas de feuille fiable → laisser tel quel, le garde-fou protège).
 */
export const CANONICAL_LEAF: Record<string, string | null> = {
  'soin-du-corps-et-visage/nettoyant-visage': 'soin-du-corps-et-visage/nettoyant-visage/gel-nettoyant-visage',
  'soin-du-corps-et-visage/creme-hydratante': 'soin-du-corps-et-visage/creme-hydratante/hydratant-corps',
  'soin-du-corps-et-visage/soin-anti-age': 'soin-du-corps-et-visage/soin-anti-age/creme-anti-age-visage-jour',
  'soin-du-corps-et-visage/masque-et-gommage': 'soin-du-corps-et-visage/masque-et-gommage/masque-creme-gel',
  'soin-du-corps-et-visage/soin-des-mains': 'soin-du-corps-et-visage/soin-des-mains/creme-pour-les-mains',
  'soin-du-corps-et-visage/soin-des-pieds-et-jambes': 'soin-du-corps-et-visage/soin-des-pieds-et-jambes/hydratants-pour-les-pieds',
  'soin-du-corps-et-visage/soin-des-levres': 'soin-du-corps-et-visage/soin-des-levres/baume-a-levres',
  'soin-du-corps-et-visage/soin-des-yeux': 'soin-du-corps-et-visage/soin-des-yeux/anti-poches-anti-cernes',
  'soin-du-corps-et-visage/soin-acne-et-imperfection': 'soin-du-corps-et-visage/soin-acne-et-imperfection/soin-anti-imperfections',
  'soin-du-corps-et-visage/soin-anti-cellulite': 'soin-du-corps-et-visage/soin-anti-cellulite/creme-gel-huile-anti-cellulite',
  'soin-du-corps-et-visage/eaux-thermales-brumes': 'soin-du-corps-et-visage/soins-apaisants/eau-thermale',
  'hygiene-du-corps/produit-de-bain': 'hygiene-du-corps/produit-de-bain/gel-douche',
  'hygiene-du-corps/deodorant': 'hygiene-du-corps/deodorant/deodorant-spray',
  'hygiene-du-corps/hygiene-intime': 'hygiene-du-corps/hygiene-intime/toilette-intime',
  'coiffure/shampooing': 'coiffure/shampooing/shampooing-classique',
  'coiffure/soin-capillaire': 'coiffure/soin-capillaire/apres-shampooing',
  'coiffure/produits-coiffants': 'coiffure/produits-coiffants/gel-coiffant',
  'coiffure/coloration-capillaire': 'coiffure/coloration-capillaire/coloration-capillaire-d-oxydation',
  'manucure-et-pedicure/vernis-et-base-ongles': 'manucure-et-pedicure/vernis-et-base-ongles/vernis-a-ongles',
  'rasage-et-epilation/mousse-et-gel-de-rasage': 'rasage-et-epilation/mousse-et-gel-de-rasage/mousse-a-raser',
  'rasage-et-epilation/apres-rasage': 'rasage-et-epilation/apres-rasage/baume-apres-rasage',
  'rasage-et-epilation/soin-de-la-barbe': 'rasage-et-epilation/soin-de-la-barbe/baume-hydratant-barbe',
  'rasage-et-epilation/epilation-et-cire': 'rasage-et-epilation/epilation-et-cire/creme-depilatoire-corps',
  // Familles sans taxonomie propre → feuille canonique INVENTÉE (consolidation).
  'produit-solaire/creme-solaire': 'produit-solaire/creme-solaire/creme-solaire',
  'produit-solaire/apres-soleil': 'produit-solaire/apres-soleil/apres-soleil',
  'produit-solaire/autobronzant': 'produit-solaire/autobronzant/autobronzant',
  'hygiene-dentaire/dentifrice-adulte': 'hygiene-dentaire/dentifrice-adulte/dentifrice',
  'hygiene-dentaire/bain-de-bouche': 'hygiene-dentaire/bain-de-bouche/bain-de-bouche',
  'bien-etre/huile-essentielle': 'bien-etre/huile-essentielle/huile-essentielle',
  'parfum': 'parfum/parfum-mixte/eau-de-parfum-mixte',
  // Cibles sans feuille fiable → abstention (laisser tel quel) :
  'maquillage': null,
  'manucure-et-pedicure/soin-et-traitement-des-ongles': null,
  'soin-du-corps-et-visage/soin-anti-vergetures': null,
}

/**
 * Mapping DÉTERMINISTE d'une catégorie-bucket poubelle connue (label FR / catégorie
 * OBF anglaise) → préfixe de taxonomie. Sert de 2ᵉ signal à la re-catégorisation
 * quand le NOM n'a pas de mot-clé exploitable. Clés normalisées (normalizeType).
 * Les buckets AMBIGUS (« gel », « coiffure », « maquillage », labels OBF génériques)
 * sont VOLONTAIREMENT absents → seul le nom peut les classer, sinon abstention.
 */
export const JUNK_BUCKET_TO_PREFIX: Record<string, string> = {
  // Solaire
  'creme solaire adulte': 'produit-solaire/creme-solaire',
  'creme solaire enfant': 'produit-solaire/creme-solaire',
  'creme solaire anti-age': 'produit-solaire/creme-solaire',
  'creme solaire visage': 'produit-solaire/creme-solaire',
  'produit-solaire': 'produit-solaire/creme-solaire',
  sunscreen: 'produit-solaire/creme-solaire',
  suncare: 'produit-solaire/creme-solaire',
  'in-sun-protections': 'produit-solaire/creme-solaire',
  'after-sun-care': 'produit-solaire/apres-soleil',
  // Capillaire
  'soins capillaires cibles': 'coiffure/soin-capillaire',
  'soin thermo-protecteur capillaire': 'coiffure/soin-capillaire',
  'soin solaire capillaire': 'coiffure/soin-capillaire',
  'masque capillaire': 'coiffure/soin-capillaire',
  'hair-conditioners': 'coiffure/soin-capillaire',
  'hair-conditioners-for-damaged-hair': 'coiffure/soin-capillaire',
  shampoo: 'coiffure/shampooing',
  'shampooing classique': 'coiffure/shampooing',
  'hair-dyes': 'coiffure/coloration-capillaire',
  'coloration capillaire d-oxydation': 'coiffure/coloration-capillaire',
  'retouche racines': 'coiffure/coloration-capillaire',
  'hair-sprays': 'coiffure/produits-coiffants',
  'hair-gel': 'coiffure/produits-coiffants',
  'hair-straightening': 'coiffure/soin-capillaire',
  // Bain / douche / savon
  'body-wash': 'hygiene-du-corps/produit-de-bain',
  'shower-gel': 'hygiene-du-corps/produit-de-bain',
  'body-gels': 'hygiene-du-corps/produit-de-bain',
  'bubble-baths': 'hygiene-du-corps/produit-de-bain',
  'showers-and-baths': 'hygiene-du-corps/produit-de-bain',
  'bath-salts': 'hygiene-du-corps/produit-de-bain',
  'gel douche': 'hygiene-du-corps/produit-de-bain',
  soap: 'hygiene-du-corps/produit-de-bain',
  'hand-soap': 'hygiene-du-corps/produit-de-bain',
  'hand-soap-sanitizers': 'hygiene-du-corps/produit-de-bain',
  handwash: 'hygiene-du-corps/produit-de-bain',
  'hand-wash': 'hygiene-du-corps/produit-de-bain',
  // Déodorant
  antiperspirants: 'hygiene-du-corps/deodorant',
  'anti-perspirants': 'hygiene-du-corps/deodorant',
  'deodorants-anti-transpirants': 'hygiene-du-corps/deodorant',
  // Hydratant / crème corps-visage
  'body-milks': 'soin-du-corps-et-visage/creme-hydratante',
  'body-lotion': 'soin-du-corps-et-visage/creme-hydratante',
  'night-creams': 'soin-du-corps-et-visage/creme-hydratante',
  'day-creams': 'soin-du-corps-et-visage/creme-hydratante',
  'day-and-night-creams': 'soin-du-corps-et-visage/creme-hydratante',
  'facial-creams': 'soin-du-corps-et-visage/creme-hydratante',
  'face-cream': 'soin-du-corps-et-visage/creme-hydratante',
  'face-creams': 'soin-du-corps-et-visage/creme-hydratante',
  'skin-cream': 'soin-du-corps-et-visage/creme-hydratante',
  creams: 'soin-du-corps-et-visage/creme-hydratante',
  cream: 'soin-du-corps-et-visage/creme-hydratante',
  moisturiser: 'soin-du-corps-et-visage/creme-hydratante',
  moisturisers: 'soin-du-corps-et-visage/creme-hydratante',
  'perfumed-moisturiser': 'soin-du-corps-et-visage/creme-hydratante',
  'creme visage': 'soin-du-corps-et-visage/creme-hydratante',
  'baby-cream': 'soin-du-corps-et-visage/creme-hydratante',
  // Anti-âge
  'anti-wrinkles-creams': 'soin-du-corps-et-visage/soin-anti-age',
  'anti-aging-face-care-products': 'soin-du-corps-et-visage/soin-anti-age',
  // Nettoyant / démaquillant
  'cleansing-milks': 'soin-du-corps-et-visage/nettoyant-visage',
  'facial-wash': 'soin-du-corps-et-visage/nettoyant-visage',
  'face-lotions': 'soin-du-corps-et-visage/nettoyant-visage',
  'eye-makeup-remover': 'maquillage/demaquillant',
  // Zones ciblées
  'foot-creams': 'soin-du-corps-et-visage/soin-des-pieds-et-jambes',
  'hand-cream': 'soin-du-corps-et-visage/soin-des-mains',
  'slimming-body-care': 'soin-du-corps-et-visage/soin-anti-cellulite',
  // Intime
  'personal-lubricants': 'hygiene-du-corps/hygiene-intime',
  'lubricating-gels': 'hygiene-du-corps/hygiene-intime',
  // Dentaire
  toothpaste: 'hygiene-dentaire/dentifrice-adulte',
  'whitening-toothpastes': 'hygiene-dentaire/dentifrice-adulte',
  'dentifrice adulte': 'hygiene-dentaire/dentifrice-adulte',
  dental: 'hygiene-dentaire/dentifrice-adulte',
  // Manucure
  'nail-polish-removers': 'manucure-et-pedicure/vernis-et-base-ongles',
}

/**
 * AFFINAGE À LA FEUILLE : dans une famille `l1/l2` donnée, choisit la sous-sous-
 * catégorie (feuille 3 niveaux RÉELLE de la taxonomie) d'après un mot-clé fort du
 * nom. Retombe sur la feuille modale (CANONICAL_LEAF) si aucun mot-clé ne matche.
 * Ne couvre que les familles à forte volumétrie où le nom désigne fiablement la
 * feuille ; les autres familles gardent leur feuille modale.
 */
const LEAF_RULES: Record<string, { re: RegExp; leaf: string }[]> = {
  'soin-du-corps-et-visage/nettoyant-visage': [
    { re: /mousse/, leaf: 'mousse-nettoyante-visage' },
    { re: /tonique|toner|lotion tonique/, leaf: 'tonique-visage' },
    { re: /huile nettoyante|cleansing oil/, leaf: 'huile-nettoyante-visage' },
    { re: /lait nettoyant|cleansing milk/, leaf: 'lait-nettoyant-visage' },
    { re: /baume nettoyant|cleansing balm/, leaf: 'baume-nettoyant-visage' },
    { re: /creme nettoyante|cream cleanser/, leaf: 'creme-nettoyante-visage' },
    { re: /lingette|wipe/, leaf: 'lingettes-nettoyantes-visage' },
    { re: /solide|pain|syndet|stick/, leaf: 'nettoyant-solide' },
    { re: /gel|gelee/, leaf: 'gel-nettoyant-visage' },
  ],
  'hygiene-du-corps/produit-de-bain': [
    { re: /savon noir/, leaf: 'savon-noir' },
    { re: /huile de douche|huile lavante|shower oil/, leaf: 'huile-de-douche' },
    { re: /bain moussant|bubble bath/, leaf: 'bain-moussant' },
    { re: /sels? de bain|bath salt/, leaf: 'sels-de-bain' },
    { re: /bombe de bain|bath bomb/, leaf: 'bombe-de-bain' },
    { re: /savon liquide|liquid soap|savon.*main|hand ?soap|handwash|hand ?wash/, leaf: 'savon-liquide' },
    { re: /savon|soap|pain surgras|syndet/, leaf: 'savon-solide' },
    { re: /gel douche|gel-douche|shower gel|body wash|creme de douche|creme lavante|douche/, leaf: 'gel-douche' },
  ],
  'coiffure/shampooing': [
    { re: /antipellicul|anti-?pellicul|dandruff/, leaf: 'shampooing-antipelliculaire' },
    { re: /shampo.*sec|dry shampoo|sec\b/, leaf: 'shampooing-sec' },
    { re: /solide/, leaf: 'shampooing-solide' },
    { re: /antichute|anti-?chute/, leaf: 'shampooing-antichute' },
    { re: /colore|meche|colored/, leaf: 'shampooing-cheveux-colores-meches' },
    { re: /secs? et abimes|abime|damaged|reparateur/, leaf: 'shampooing-cheveux-secs-et-abimes' },
    { re: /boucle|curl/, leaf: 'shampooing-cheveux-boucles' },
    { re: /gras|oily/, leaf: 'shampooing-cheveux-gras' },
  ],
  'coiffure/soin-capillaire': [
    { re: /masque|mask/, leaf: 'masque-capillaire' },
    { re: /huile|oil/, leaf: 'huile-capillaire' },
    { re: /serum/, leaf: 'serum-capillaire' },
    { re: /demelant|sans rincage|leave.?in|detangl/, leaf: 'demelant-sans-rincage' },
    { re: /lissage|lissant|smoothing|keratin/, leaf: 'lissage-capillaire' },
    { re: /boucle|curl/, leaf: 'soin-cheveux-boucles' },
    { re: /apres-?shampo|conditioner|conditionneur/, leaf: 'apres-shampooing' },
  ],
  'soin-du-corps-et-visage/creme-hydratante': [
    { re: /serum/, leaf: 'serum-hydratant-visage' },
    { re: /huile|oil/, leaf: 'huile-hydratante-corps' },
    { re: /beurre|butter|karite|shea/, leaf: 'beurre-de-karite' },
    { re: /aloe vera|aloe/, leaf: 'gel-aloe-vera' },
    { re: /nuit|night/, leaf: 'hydratant-visage-nuit' },
    { re: /corporel|corps|body/, leaf: 'hydratant-corps' },
    { re: /visage|face/, leaf: 'creme-visage' },
  ],
  'soin-du-corps-et-visage/soin-anti-age': [
    { re: /contour.*yeux|eye/, leaf: 'soin-contour-yeux-anti-age' },
    { re: /serum.*nuit|nuit.*serum/, leaf: 'serum-visage-nuit-anti-age' },
    { re: /serum/, leaf: 'serum-visage-jour-anti-age' },
    { re: /nuit|night/, leaf: 'creme-anti-age-visage-nuit' },
    { re: /huile|oil/, leaf: 'huile-anti-age-visage' },
  ],
  'hygiene-du-corps/deodorant': [
    { re: /bille|roll.?on/, leaf: 'deodorant-bille' },
    { re: /stick/, leaf: 'deodorant-stick' },
    { re: /creme/, leaf: 'deodorant-creme' },
    { re: /solide/, leaf: 'deodorant-solide' },
    { re: /spray|vaporisateur|atomiseur/, leaf: 'deodorant-spray' },
  ],
  'coiffure/produits-coiffants': [
    { re: /laque|hairspray|hair ?spray/, leaf: 'laque' },
    { re: /mousse/, leaf: 'mousse-coiffante' },
    { re: /cire|wax/, leaf: 'cire-coiffante' },
    { re: /spray/, leaf: 'spray-coiffant' },
    { re: /creme/, leaf: 'creme-coiffante' },
    { re: /gel/, leaf: 'gel-coiffant' },
  ],
  'rasage-et-epilation/mousse-et-gel-de-rasage': [
    { re: /gel/, leaf: 'gel-a-raser' },
    { re: /creme/, leaf: 'creme-a-raser' },
    { re: /savon/, leaf: 'savon-a-raser' },
    { re: /mousse/, leaf: 'mousse-a-raser' },
  ],
  'maquillage/demaquillant': [
    { re: /eau micellaire|micellaire|micelar/, leaf: 'eau-micellaire' },
    { re: /lait/, leaf: 'lait-demaquillant' },
    { re: /huile|oil/, leaf: 'huile-demaquillante' },
    { re: /baume|balm/, leaf: 'baume-demaquillant' },
    { re: /lingette|wipe/, leaf: 'lingettes-demaquillantes' },
    { re: /gel/, leaf: 'gel-demaquillant' },
    { re: /lotion/, leaf: 'lotion-demaquillante' },
  ],
}

/**
 * Feuille précise pour (famille, nom) : mot-clé fort → feuille réelle ; sinon
 * feuille modale de la famille (CANONICAL_LEAF). `null` si la famille n'a pas de
 * feuille canonique connue.
 */
export function refineLeaf(family: string, name: string | null | undefined): string | null {
  const fallback = CANONICAL_LEAF[family] ?? null
  const rules = LEAF_RULES[family]
  if (!rules) return fallback
  const n = normalizeType(name)
  if (n.length >= 3) {
    for (const r of rules) if (r.re.test(n)) return `${family}/${r.leaf}`
  }
  return fallback
}

/**
 * Décide la nouvelle catégorie (feuille 3 niveaux) pour la re-catégorisation d'un
 * produit mal rangé, à partir de son NOM et de sa catégorie-bucket actuelle.
 * Cascade (précision décroissante) : nom mot-clé fort → bucket connu → nom
 * fourre-tout. `null` = on n'a rien de fiable → laisser tel quel.
 */
export function recategorizeLeaf(
  name: string | null | undefined,
  currentCategory: string | null | undefined,
): { leaf: string; via: 'name-strong' | 'bucket' | 'name-catchall' } | null {
  const strip = (p: string | null) => (p ? p.replace(/\/%$/, '') : null)
  const toLeaf = (prefix: string | null, via: 'name-strong' | 'bucket' | 'name-catchall') => {
    if (!prefix) return null
    // Affinage à la feuille RÉELLE de la taxonomie d'après le nom (sinon modale).
    const leaf = refineLeaf(prefix, name)
    return leaf ? { leaf, via } : null
  }

  const strong = toLeaf(strip(productNameToCategoryPrefix(name)), 'name-strong')
  if (strong) return strong

  const bucketPrefix = JUNK_BUCKET_TO_PREFIX[normalizeType(currentCategory)]
  const bucket = toLeaf(bucketPrefix ?? null, 'bucket')
  if (bucket) return bucket

  const catchAll = toLeaf(strip(productTypeToCategoryPrefix(name)), 'name-catchall')
  if (catchAll) return catchAll

  return null
}

/** Mots indiquant une VRAIE forme gommage/masque (rinse-off exfoliant/masque). */
const EXFOLIANT_MASK_RE =
  /gommage|gommant|exfolia|exfoliant|scrub|peeling|\bpeel\b|peel.?off|masque|\bmask\b|mascar|\bmasca\b|argile|ghassoul|clay|grains?|micro-?bille|poudre exfoliante|polish|body ?buff|\bbuff\b|\bsel\b|\bsalt\b|resurfac|desquam|microderm/

/**
 * Détecte un produit MAL RANGÉ dans une famille à FORME PHYSIQUE DISTINCTIVE, où
 * l'erreur est non ambiguë (bug bêta « Mixa Sérum … rangé en Gommage Visage »).
 *
 * Cas traité (haute précision) : catégorie catalogue = `…/masque-et-gommage/*`
 * (un gommage/masque est une forme physique nette : soit ç'en est un, soit non),
 * MAIS le nom ne contient AUCUN mot exfoliant/masque ET décrit clairement un
 * autre type (sérum, nettoyant, crème, lait, gel douche, shampooing…). On NE
 * touche PAS les vrais gommages/masques (nom avec « gommage/masque/exfoliant… »),
 * ni les nuances de taxonomie DANS une même forme (anti-âge vs anti-taches…).
 *
 * Retourne la feuille cible (via CANONICAL_LEAF du type déduit du nom) ou null.
 */
export function detectMisfileLeaf(
  name: string | null | undefined,
  category: string | null | undefined,
): { leaf: string; fromFamily: string; toFamily: string } | null {
  if (!isSpecificCategorySlug(category)) return null
  const cat = (category as string).trim()
  const catFam = cat.split('/').slice(0, 2).join('/')
  if (catFam !== 'soin-du-corps-et-visage/masque-et-gommage') return null

  const n = normalizeType(name)
  if (!n || EXFOLIANT_MASK_RE.test(n)) return null // le nom CONFIRME un gommage/masque → on garde

  // Le nom ne dit pas « gommage/masque » → quel type EST-ce vraiment ?
  const prefix = productTypeToCategoryPrefix(name) // catch-all inclus : ici tout ≠ gommage est un gain
  if (!prefix) return null
  const toFam = prefix.replace(/\/%$/, '')
  // Destination parfum EXCLUE : piège « sans parfum » / « fragrance » sur des soins.
  if (toFam === catFam || toFam.startsWith('parfum')) return null
  const leaf = refineLeaf(toFam, name) // feuille précise de la taxonomie
  return leaf ? { leaf, fromFamily: catFam, toFamily: toFam } : null
}

export type AltQueryKind = 'exact' | 'prefix'
export type AltQuerySource = 'catalog-category' | 'product-type' | 'product-name'
export interface AlternativesQuery {
  kind: AltQueryKind
  /** slug exact (kind='exact') OU préfixe LIKE terminé par `/%` (kind='prefix'). */
  value: string
  source: AltQuerySource
}

/**
 * Décide la requête catégorie à utiliser pour chercher des alternatives.
 * Retourne `null` (abstention) quand aucun signal fiable n'existe → l'appelant
 * n'affiche AUCUNE alternative (préférable à une reco hors-sujet).
 */
export function resolveAlternativesQuery(signals: {
  /** Catégorie issue du catalogue (EAN direct ou vote recherche). */
  catalogCategory?: string | null
  /** product_type de l'analyseur. */
  productType?: string | null
  /** Nom commercial du produit (dernier recours). */
  productName?: string | null
}): AlternativesQuery | null {
  // 1. Catégorie catalogue SPÉCIFIQUE → match exact (le plus précis : niveau feuille).
  if (isSpecificCategorySlug(signals.catalogCategory)) {
    return { kind: 'exact', value: (signals.catalogCategory as string).trim(), source: 'catalog-category' }
  }

  // 2. product_type → préfixe fonctionnel.
  const ptPrefix = productTypeToCategoryPrefix(signals.productType)
  if (ptPrefix) return { kind: 'prefix', value: ptPrefix, source: 'product-type' }

  // 3. Nom → préfixe (mot-clé fort uniquement).
  const namePrefix = productNameToCategoryPrefix(signals.productName)
  if (namePrefix) return { kind: 'prefix', value: namePrefix, source: 'product-name' }

  // 4. Rien de fiable → abstention.
  return null
}
