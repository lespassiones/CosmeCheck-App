/**
 * Types d'analyse INCI — alignés sur la VRAIE réponse de /api/analyser
 * (CosmetWiki), telle que stockée dans `analyses.result_json`.
 *
 * Convention de casse :
 * - `ColorRating` (minuscule) est la forme CANONIQUE de l'app mobile, alignée
 *   sur `colors.rating` et `ColorBadge` + les clés de `counts`.
 * - L'API renvoie les couleurs d'ingrédients en CAPITALISÉ ('Vert'…) — type
 *   `DbColorRating`. Utiliser `normalizeColor()` au parsing.
 */

export type ColorRating = 'vert' | 'jaune' | 'orange' | 'rouge'
export type DbColorRating = 'Vert' | 'Jaune' | 'Orange' | 'Rouge'
export type ScoreTone = 'green' | 'amber' | 'orange' | 'rose'

/** Normalise une couleur brute (API/DB, capitalisée/accentuée) → ColorRating. */
export function normalizeColor(raw: string | null | undefined): ColorRating | null {
  if (!raw) return null
  const v = raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
  if (v === 'vert') return 'vert'
  if (v === 'jaune') return 'jaune'
  if (v === 'orange') return 'orange'
  if (v === 'rouge') return 'rouge'
  return null
}

export interface AnalyseCounts {
  total: number
  matched: number
  vert: number
  jaune: number
  orange: number
  rouge: number
  unknown: number
}

export interface AnalyseItem {
  position: number
  input: string
  slug: string | null
  name: string
  colorRating: DbColorRating | null
  dbColorRating?: DbColorRating | null
  casNumber?: string | null
  translationFr?: string | null
  primaryFunction?: string | null
  allFunctions?: string[]
  tags?: string[]
  matchKind?: string
  confidence?: number
  thresholdContext?: string | null
  thresholdLabel?: string | null
}

export type ObservationStatus = 'present' | 'absent' | 'info' | 'warn'

/**
 * Élément d'une observation. L'Edge Function `analyser` renvoie des objets
 * `{ name, slug, colorRating }` ; on tolère aussi une simple chaîne (données
 * historiques / défensif).
 */
export interface ObservationItem {
  name: string
  slug?: string | null
  colorRating?: string | null
}

export interface Observation {
  tag: string
  label: string
  status: ObservationStatus
  count: number
  items?: (string | ObservationItem)[]
  message?: string
}

export interface AnalyseSpectrum {
  top5: (DbColorRating | null)[]
  top10: (DbColorRating | null)[]
}

export interface EuFragranceAllergens {
  detected: { inciName: string; label: string; note?: string; position: number }[]
  total: number
}

export type ProductCategory = string

/** Réponse complète de /api/analyser (= analyses.result_json). */
export interface AnalyseResponse {
  counts: AnalyseCounts
  score: number
  scoreLabel: string
  scoreTone: ScoreTone
  items: AnalyseItem[]
  observations: Observation[]
  aliasesUsed?: { from: string; to: string }[]
  suggestions?: { position: number; input: string; suggestedName: string; confidence: number }[]
  spectrum: AnalyseSpectrum
  euFragranceAllergens?: EuFragranceAllergens
  synthesis: string | null
  /** Clé des restrictions au moment où la synthèse a été générée (cf. restrictionsKey).
   *  Si elle diffère des restrictions actuelles, la synthèse est régénérée. */
  synthesisRestrictionsKey?: string | null
  productType?: string | null
  category?: ProductCategory | null
}

// ─── Helpers (purs) ─────────────────────────────────────────────────────────

const TONE_TO_RATING: Record<ScoreTone, ColorRating> = {
  green: 'vert',
  amber: 'jaune',
  orange: 'orange',
  rose: 'rouge',
}

export function toneToColorRating(tone: ScoreTone): ColorRating {
  return TONE_TO_RATING[tone]
}

/** Seuils RÉELS du web : ≥17 vert · ≥13 jaune · ≥9 orange · sinon rouge. */
export function getColorRatingFromScore(score: number): ColorRating {
  if (score >= 17) return 'vert'
  if (score >= 13) return 'jaune'
  if (score >= 9) return 'orange'
  return 'rouge'
}

export function getLabelFromRating(rating: ColorRating): string {
  const map: Record<ColorRating, string> = {
    vert: 'Excellent',
    jaune: 'Bon',
    orange: 'Acceptable',
    rouge: 'À améliorer',
  }
  return map[rating]
}

export function getRatingColors(rating: ColorRating): { text: string; bg: string } {
  const map: Record<ColorRating, { text: string; bg: string }> = {
    vert: { text: '#16A34A', bg: '#DCFCE7' },
    jaune: { text: '#CA8A04', bg: '#FEF9C3' },
    orange: { text: '#EA580C', bg: '#FFEDD5' },
    rouge: { text: '#DC2626', bg: '#FEE2E2' },
  }
  return map[rating]
}

/** Parse défensif du result_json (jsonb) en AnalyseResponse. */
export function parseAnalyseResponse(json: unknown): AnalyseResponse | null {
  if (!json || typeof json !== 'object') return null
  const r = json as Record<string, unknown>
  if (typeof r.score !== 'number' || !r.counts || typeof r.counts !== 'object') return null
  // Défensif : des analyses cachées ont des champs ATTENDUS-tableau corrompus en
  // objet/scalaire (ex. `tags` enrichi Wikidata = objet). On les re-coerce en
  // tableau pour qu'aucune itération downstream (computeEssentiel, rendu) ne casse.
  if (Array.isArray(r.items)) {
    r.items = r.items.map((raw) => {
      if (!raw || typeof raw !== 'object') return raw
      const it = raw as Record<string, unknown>
      if ('tags' in it && !Array.isArray(it.tags)) it.tags = []
      if ('allFunctions' in it && !Array.isArray(it.allFunctions)) it.allFunctions = []
      return it
    })
  }
  return json as AnalyseResponse
}
