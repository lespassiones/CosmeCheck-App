/**
 * Traduction des contraintes ad-hoc exprimées dans le message (« sans parfum »,
 * « sans alcool »…) en paramètres d'exclusion de la RPC `cosme_check_recommend_products`
 * (`p_exclude_families` / `p_exclude_ingredients`).
 *
 * Le LLM émet, dans le bloc RECO, un tableau `exclude` de MOTS-CLÉS CANONIQUES
 * (vocabulaire contrôlé ci-dessous). On les résout ici, côté client, vers des
 * slugs de familles (que la RPC sait étendre en noms INCI) ou des tokens INCI
 * exacts. Logique pure et testable.
 *
 * NB : les contraintes SENSORIELLES (« fruité », « sent bon ») ne sont PAS dans ce
 * vocabulaire : la base ne contient que l'INCI, pas le profil olfactif. L'advisor
 * les décline honnêtement (cf. prompt) au lieu de prétendre les filtrer.
 */
export interface ExcludeSpec {
  /** Slugs de familles de restriction (résolus en noms INCI par la RPC). */
  families: string[]
  /** Tokens INCI exacts à bannir (comparaison token-exact). */
  ingredients: string[]
  /** Libellé FR affichable (« sans parfum »). */
  label: string
}

// Vocabulaire contrôlé : mot-clé canonique -> résolution.
const EXCLUDE_MAP: Record<string, ExcludeSpec> = {
  parfum: { families: ['allergene-parfumant'], ingredients: ['parfum', 'fragrance'], label: 'sans parfum' },
  // Alcools desséchants seulement : les tokens gras (cetyl/cetearyl alcohol) NE
  // matchent pas (comparaison token-exact sur le token INCI complet).
  alcool: {
    families: [],
    ingredients: ['alcohol', 'alcohol denat.', 'alcohol denat', 'sd alcohol', 'sd alcohol 40', 'sd alcohol 40-b', 'ethanol', 'ethyl alcohol'],
    label: 'sans alcool',
  },
  silicone: { families: ['silicone'], ingredients: [], label: 'sans silicone' },
  huile_essentielle: { families: ['huile-essentielle'], ingredients: [], label: 'sans huile essentielle' },
  sulfate: { families: ['sulfate'], ingredients: [], label: 'sans sulfate' },
  paraben: { families: ['paraben'], ingredients: [], label: 'sans paraben' },
  huile_minerale: { families: ['huile-minerale'], ingredients: [], label: 'sans huile minérale' },
  huile_palme: { families: ['huile-palme'], ingredients: [], label: 'sans huile de palme' },
  peg: { families: ['ethoxyle'], ingredients: [], label: 'sans PEG' },
  edta: { families: ['edta'], ingredients: [], label: 'sans EDTA' },
  phtalate: { families: ['phtalate'], ingredients: [], label: 'sans phtalate' },
  colorant: { families: ['colorant-synthese'], ingredients: [], label: 'sans colorant de synthèse' },
  filtre_uv_chimique: { families: ['filtre-uv-chimique'], ingredients: [], label: 'sans filtre UV chimique' },
  ammonium_quaternaire: { families: ['ammonium-quaternaire'], ingredients: [], label: 'sans ammonium quaternaire' },
  allergene: { families: ['allergene-reglemente', 'allergene-parfumant'], ingredients: [], label: 'sans allergène' },
  conservateur: { families: ['conservateur'], ingredients: [], label: 'sans conservateur' },
  cmr: { families: ['cmr'], ingredients: [], label: 'sans CMR' },
}

// Synonymes / formulations libres -> clé canonique.
const ALIASES: Record<string, string> = {
  fragrance: 'parfum',
  parfums: 'parfum',
  'sans-parfum': 'parfum',
  alcohol: 'alcool',
  alcools: 'alcool',
  silicones: 'silicone',
  he: 'huile_essentielle',
  'huiles-essentielles': 'huile_essentielle',
  huiles_essentielles: 'huile_essentielle',
  sulfates: 'sulfate',
  parabens: 'paraben',
  'huile-minerale': 'huile_minerale',
  'huiles-minerales': 'huile_minerale',
  'huile-de-palme': 'huile_palme',
  palme: 'huile_palme',
  pegs: 'peg',
  ethoxyle: 'peg',
  phtalates: 'phtalate',
  colorants: 'colorant',
  'colorant-synthetique': 'colorant',
  'colorant-de-synthese': 'colorant',
  'filtre-chimique': 'filtre_uv_chimique',
  'filtres-chimiques': 'filtre_uv_chimique',
  allergenes: 'allergene',
  conservateurs: 'conservateur',
}

function canon(keyword: string): string {
  const k = (keyword ?? '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .replace(/^sans\s+/, '')
    .replace(/[\s/]+/g, '_')
  return ALIASES[k] ?? ALIASES[k.replace(/_/g, '-')] ?? k
}

/** Résout un mot-clé d'exclusion, ou null si inconnu (sensoriel / non mappable). */
export function resolveExclusion(keyword: string): ExcludeSpec | null {
  return EXCLUDE_MAP[canon(keyword)] ?? null
}

export interface ResolvedExclusions {
  families: string[]
  ingredients: string[]
  /** Libellés des contraintes reconnues (pour les messages). */
  labels: string[]
  /** Mots-clés non reconnus (sensoriels / hors base) à décliner honnêtement. */
  unknown: string[]
}

/** Résout une liste de mots-clés en paramètres d'exclusion RPC fusionnés. */
export function resolveExclusions(keywords: string[] | null | undefined): ResolvedExclusions {
  const families = new Set<string>()
  const ingredients = new Set<string>()
  const labels: string[] = []
  const unknown: string[] = []
  for (const kw of keywords ?? []) {
    if (!kw || typeof kw !== 'string') continue
    const spec = resolveExclusion(kw)
    if (!spec) {
      unknown.push(kw.trim())
      continue
    }
    spec.families.forEach((f) => families.add(f))
    spec.ingredients.forEach((i) => ingredients.add(i))
    if (!labels.includes(spec.label)) labels.push(spec.label)
  }
  return { families: [...families], ingredients: [...ingredients], labels, unknown }
}
