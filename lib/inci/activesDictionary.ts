/**
 * Dictionnaire canonique des actifs cosmétiques par classe, pour la détection
 * DÉTERMINISTE (conflits de routine, réorganisation matin/soir).
 *
 * ZÉRO import, zéro global : ce module est une feuille pure, importable telle
 * quelle par ts-jest ET copiable côté Edge (Deno) si besoin (pattern
 * absenceGuard). Toute évolution doit préserver cette contrainte.
 *
 * Slugs VÉRIFIÉS en DB le 7 juillet 2026 contre cosme_check.ingredients.slug
 * (30 slugs présents). Absents de la DB donc volontairement exclus :
 * 'retinaldehyde' (c'est 'retinal' en DB), 'tretinoin' (médicament, hors
 * cosmétique UE), 'polyhydroxyacid' (slug générique inexistant : les vrais PHA
 * sont gluconolactone et lactobionic-acid).
 *
 * Exclusions ASSUMÉES (ne pas réintroduire sans raison dermato) :
 * - bakuchiol : rétinol-like NON photosensibilisant, aucune règle soir/AHA.
 * - citric-acid / tartaric-acid : quasi toujours ajusteurs de pH, les compter
 *   en AHA sur-détecterait massivement.
 * - azelaic-acid : bien toléré en association, pas un exfoliant à conflits.
 *
 * Tags : vocabulaire réel de cosme_check.ingredients.tags (couverture vérifiée
 * en DB : retinoides 18 ingrédients, acide-salicylique 41, filtre-uv 102,
 * filtre-uv-mineral 2, alcool 11, huile-essentielle 157).
 */

export type ActiveClass =
  | 'retinoid'
  | 'aha'
  | 'bha'
  | 'pha'
  | 'vitc_pure'
  | 'vitc_derivative'
  | 'niacinamide'
  | 'benzoyl_peroxide'

/** Ordre canonique des classes (utilisé pour trier les sorties de classifyItem). */
export const ACTIVE_CLASSES: readonly ActiveClass[] = [
  'retinoid',
  'aha',
  'bha',
  'pha',
  'vitc_pure',
  'vitc_derivative',
  'niacinamide',
  'benzoyl_peroxide',
]

export const ACTIVE_CLASS_LABEL: Record<ActiveClass, string> = {
  retinoid: 'Rétinoïde',
  aha: 'Acide exfoliant (AHA)',
  bha: 'Acide salicylique (BHA)',
  pha: 'Acide doux (PHA)',
  vitc_pure: 'Vitamine C pure',
  vitc_derivative: 'Dérivé de vitamine C',
  niacinamide: 'Niacinamide',
  benzoyl_peroxide: 'Peroxyde de benzoyle',
}

export const RETINOID_SLUGS: readonly string[] = [
  'retinol',
  'retinal',
  'retinyl-palmitate',
  'retinyl-acetate',
  'retinyl-retinoate',
  'hydroxypinacolone-retinoate',
]

export const AHA_SLUGS: readonly string[] = [
  'glycolic-acid',
  'lactic-acid',
  'mandelic-acid',
  'malic-acid',
]

export const BHA_SLUGS: readonly string[] = [
  'salicylic-acid',
  'betaine-salicylate',
  'capryloyl-salicylic-acid',
]

export const PHA_SLUGS: readonly string[] = [
  'gluconolactone',
  'lactobionic-acid',
]

export const VITC_PURE_SLUGS: readonly string[] = ['ascorbic-acid']

export const VITC_DERIVATIVE_SLUGS: readonly string[] = [
  'tetrahexyldecyl-ascorbate',
  'ascorbyl-glucoside',
  'sodium-ascorbyl-phosphate',
  'magnesium-ascorbyl-phosphate',
  'ethyl-ascorbic-acid',
  '3-o-ethyl-ascorbic-acid',
  'ascorbyl-palmitate',
  'ascorbyl-tetraisopalmitate',
]

export const NIACINAMIDE_SLUGS: readonly string[] = ['niacinamide']

export const BENZOYL_PEROXIDE_SLUGS: readonly string[] = ['benzoyl-peroxide']

const CLASS_SLUGS: Record<ActiveClass, readonly string[]> = {
  retinoid: RETINOID_SLUGS,
  aha: AHA_SLUGS,
  bha: BHA_SLUGS,
  pha: PHA_SLUGS,
  vitc_pure: VITC_PURE_SLUGS,
  vitc_derivative: VITC_DERIVATIVE_SLUGS,
  niacinamide: NIACINAMIDE_SLUGS,
  benzoyl_peroxide: BENZOYL_PEROXIDE_SLUGS,
}

/** Tags DB complémentaires : filet quand le slug manque (alias, variantes). */
export const CLASS_TAGS: Partial<Record<ActiveClass, readonly string[]>> = {
  retinoid: ['retinoides'],
  bha: ['acide-salicylique'],
}

export const UV_FILTER_TAGS: readonly string[] = ['filtre-uv', 'filtre-uv-mineral']
export const ALCOHOL_TAG = 'alcool'
export const ESSENTIAL_OIL_TAG = 'huile-essentielle'

// Plage des diacritiques combinants (U+0300..U+036F), construite en ASCII pur
// pour eviter tout caractere combinant isole dans la source.
const COMBINING_DIACRITICS_RE = new RegExp('[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + ']', 'g')

/** Minuscules + suppression des diacritiques (é -> e), sans dépendance. */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING_DIACRITICS_RE, '')
}

/**
 * Classes d'actifs d'un ingrédient à partir de son slug canonique et de ses
 * tags DB. Slug prioritaire, tags en complément. Sortie dédupliquée, triée
 * dans l'ordre canonique ACTIVE_CLASSES (déterminisme).
 */
export function classifyItem(
  slug: string | null | undefined,
  tags: readonly string[] | null | undefined,
): ActiveClass[] {
  const found = new Set<ActiveClass>()
  if (slug) {
    for (const cls of ACTIVE_CLASSES) {
      if (CLASS_SLUGS[cls].includes(slug)) found.add(cls)
    }
  }
  if (Array.isArray(tags)) {
    for (const cls of ACTIVE_CLASSES) {
      const clsTags = CLASS_TAGS[cls]
      if (!clsTags) continue
      if (tags.some((t) => clsTags.includes(t))) found.add(cls)
    }
  }
  return ACTIVE_CLASSES.filter((cls) => found.has(cls))
}

export function isExfoliatingClass(cls: ActiveClass): boolean {
  return cls === 'aha' || cls === 'bha' || cls === 'pha'
}

export interface SunscreenSignals {
  category: string | null
  categoryPrecise: string | null
  productType: string | null
  /** Tags de chaque ingrédient avec sa position INCI (1 = premier). */
  itemTags: readonly { tags: readonly string[]; position: number }[]
}

const SUNSCREEN_TEXT = /(^|[^a-z])spf\s*\d*|solaire|sunscreen|ecran/

/**
 * Vrai si le produit est une protection solaire.
 * Signaux : catégorie / catégorie précise / productType évocateurs
 * (miroir de normalizeProductTypeToCategory côté analyser), OU au moins un
 * ingrédient portant un tag filtre-uv dans le top 10 des positions INCI
 * (un filtre en tête de formule = produit de protection, pas un simple
 * maquillage teinté).
 */
export function isSunscreenProduct(p: SunscreenSignals): boolean {
  const texts = [p.category, p.categoryPrecise, p.productType]
  for (const t of texts) {
    if (t && SUNSCREEN_TEXT.test(normalize(t))) return true
  }
  return p.itemTags.some(
    (it) =>
      it.position > 0 &&
      it.position <= 10 &&
      Array.isArray(it.tags) &&
      it.tags.some((tag) => UV_FILTER_TAGS.includes(tag)),
  )
}
