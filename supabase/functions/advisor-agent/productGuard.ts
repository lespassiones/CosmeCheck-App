/**
 * Pure : garde-fous sur les candidats de `search_products` (advisor-agent).
 *
 * 1. RESTRICTIONS SUR LE TEXTE INCI. La RPC `cosme_check_recommend_products`
 *    exclut une famille d'après les ingrédients qu'elle a IDENTIFIÉS. Sur une
 *    fiche mal parsée (données OBF), PARFUM n'est pas identifié : il ne pèse ni
 *    sur la note (20/20) ni sur l'exclusion. Cas réel (29/09/2026) : baume mains
 *    avec PARFUM proposé à un profil « sans parfum ». On relit donc la
 *    composition brute : une famille connue est cherchée par motif INCI, un
 *    ingrédient restreint par son nom.
 * 2. DOUBLONS : le même produit existe sous plusieurs EAN (même marque + nom).
 * 3. Entités HTML dans les noms importés (« L&#x27;Oreal »).
 *
 * Pas de dépendance Deno : testé par lib/__tests__/advisorProductGuard.test.ts.
 */

const COMBINING = /[̀-ͯ]/g

function fold(v: string): string {
  return v.toLowerCase().normalize('NFD').replace(COMBINING, '')
}

const PARFUM = /\b(parfum|fragrance)\b/i
const ALLERGENES =
  /\b(limonene|linalool|citronellol|geraniol|coumarin|citral|eugenol|isoeugenol|hexyl cinnamal|amyl cinnamal|amylcinnamyl alcohol|benzyl (benzoate|salicylate|cinnamate)|farnesol|cinnamal|cinnamyl alcohol|hydroxycitronellal|alpha-isomethyl ionone|butylphenyl methylpropional|anise alcohol|evernia (prunastri|furfuracea))\b/i
// « ALCOHOL » seul ou dénaturé ; pas les alcools gras (cetearyl alcohol…).
const ALCOOL = /\b(alcohol denat\.?|sd alcohol( \d+\w?)?|ethanol)\b|(^|[,(/]\s*)alcohol\s*(,|\)|\/|$)/i
const SULFATE = /\b(sodium|ammonium|magnesium|tea|mea)[ -](laureth|lauryl|myreth|coco|cetearyl)[ -]sulfate\b|\bsodium coco[ -]?sulfate\b/i
const SILICONE = /(dimethicone|dimethiconol|cyclo(penta|hexa|tetra)siloxane|cyclomethicone|amodimethicone|phenyl trimethicone|\bsiloxane\b)/i
const PARABEN = /paraben/i
const HUILE_MINERALE = /\b(paraffinum liquidum|mineral oil|petrolatum|cera microcristallina|microcrystalline wax)\b/i
// Huiles essentielles : genres botaniques typiques suivis de « … oil ».
const HUILE_ESSENTIELLE =
  /\b(lavandula|citrus|mentha|melaleuca|eucalyptus|rosmarinus|cymbopogon|pelargonium|cananga|pogostemon|cedrus|juniperus|cupressus|salvia|thymus|origanum|cinnamomum|syzygium|eugenia|boswellia|santalum|litsea|ravensara|cistus|ocimum|foeniculum|pinus|abies|picea|chrysopogon|vetiveria)\b[^,]{0,40}\boil\b/i
const SEL_ALUMINIUM = /\baluminum (chlorohydrate|zirconium\b[^,]*|sesquichlorohydrate|chloride)\b|\b(potassium|ammonium) alum\b|\balum\b/i
const RETINOIDE = /\b(retinol|retinal|retinyl \w+|hydroxypinacolone retinoate)\b/i
const ACIDE_SALICYLIQUE = /\bsalicylic acid\b/i
const FILTRE_UV_CHIMIQUE =
  /\b(octocrylene|butyl methoxydibenzoylmethane|avobenzone|homosalate|ethylhexyl (methoxycinnamate|salicylate|triazone)|octinoxate|oxybenzone|benzophenone-\d|bis-ethylhexyloxyphenol methoxyphenyl triazine|diethylamino hydroxybenzoyl hexyl benzoate|drometrizole trisiloxane)\b/i
const EDTA = /\b(\w+ )?edta\b/i
const PEG_PPG = /\b(peg|ppg)-\d/i
const ETHOXYLE = /\b(\w+eth-\d+|peg-\d+)/i
const PHTALATE = /phthalate/i

/** Familles (slugs en base) et mots-clés d'exclusion du modèle → motif INCI. */
const FAMILY_PATTERNS: Record<string, RegExp> = {
  'parfum': PARFUM,
  'parfum-synthese': PARFUM,
  'allergene': ALLERGENES,
  'allergenes': ALLERGENES,
  'allergene-parfumant': ALLERGENES,
  'allergene-reglemente': ALLERGENES,
  'alcool': ALCOOL,
  'sulfate': SULFATE,
  'sulfates': SULFATE,
  'silicone': SILICONE,
  'silicones': SILICONE,
  'paraben': PARABEN,
  'parabens': PARABEN,
  'huile-minerale': HUILE_MINERALE,
  'huile-essentielle': HUILE_ESSENTIELLE,
  'huiles-essentielles': HUILE_ESSENTIELLE,
  'sel-aluminium': SEL_ALUMINIUM,
  'sels-aluminium': SEL_ALUMINIUM,
  'aluminium': SEL_ALUMINIUM,
  'retinoides': RETINOIDE,
  'retinol': RETINOIDE,
  'acide-salicylique': ACIDE_SALICYLIQUE,
  'filtre-uv-chimique': FILTRE_UV_CHIMIQUE,
  'edta': EDTA,
  'peg-ppg': PEG_PPG,
  'ethoxyle': ETHOXYLE,
  'phtalate': PHTALATE,
}

function keyOf(exclude: string): string {
  return fold(exclude).trim().replace(/[_\s]+/g, '-')
}

/** Familles sans motif fiable (trop larges, ex. « conservateur ») : ignorées ici. */
const IGNORED = new Set(['conservateur', 'conservateurs', 'cmr', 'perturbateur-endocrinien', 'colorant-synthese', 'huile-vegetale', 'polymere-synthese'])

/**
 * Raison de rejet si la composition contient une exclusion, sinon null.
 * `excludes` mélange slugs de familles, mots-clés du modèle et noms INCI.
 */
export function restrictionViolation(inci: string | null | undefined, excludes: readonly string[]): string | null {
  const text = (inci ?? '').trim()
  if (!text) return null
  const folded = fold(text)
  for (const raw of excludes) {
    if (typeof raw !== 'string' || !raw.trim()) continue
    const key = keyOf(raw)
    if (IGNORED.has(key)) continue
    const pattern = FAMILY_PATTERNS[key]
    if (pattern) {
      if (pattern.test(text)) return raw
      continue
    }
    // Ingrédient précis (nom INCI) : correspondance mot à mot.
    const name = fold(raw).trim()
    if (name.length < 4) continue
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
    if (new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(folded)) return raw
  }
  return null
}

const ENTITIES: Record<string, string> = { '&amp;': '&', '&quot;': '"', '&#39;': "'", '&#x27;': "'", '&apos;': "'", '&lt;': '<', '&gt;': '>', '&nbsp;': ' ' }

/** Décode les entités HTML courantes des noms importés (OBF). */
export function decodeEntities(value: string | null): string | null {
  if (value == null) return value
  return value.replace(/&(amp|quot|#39|#x27|apos|lt|gt|nbsp);/gi, (m) => ENTITIES[m.toLowerCase()] ?? m)
}

/** Clé d'identité d'un produit : même marque + même nom = même produit. */
export function productNameKey(brand: string | null | undefined, name: string | null | undefined): string {
  return fold(`${brand ?? ''} ${name ?? ''}`).replace(/[^a-z0-9]+/g, ' ').trim()
}
