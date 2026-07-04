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
import { pastilleTone, synthScore } from './pastille'

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

/** Couleur (ColorRating) dérivée UNIQUEMENT du score — convention PASTILLE
 *  (identique à scoreToSlot / verdictToneFromScore) : ≥13 vert · ≥9 jaune ·
 *  ≥5 orange · <5 rouge. Source unique : on ne passe JAMAIS par un score_tone
 *  stocké → la couleur d'un produit est la même partout. */
export function getColorRatingFromScore(score: number): ColorRating {
  if (score >= 13) return 'vert'
  if (score >= 9) return 'jaune'
  if (score >= 5) return 'orange'
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

// ── Reconstruction défensive (analyses persistées incomplètes) ───────────────
// Le court-circuit cache EAN de l'Edge `analyser` a, pour certains produits,
// persisté un result_json SANS `score` ni `counts` (juste `items`). Plutôt que
// d'afficher « illisible », on recalcule ces champs depuis `items`. Le score
// réel (notation propriétaire CosmeCheck) est de toute façon ré-appliqué via le catalogue à l'écran.

/** Tally des couleurs d'items → AnalyseCounts (forme minuscule). */
function reconstructCounts(items: AnalyseItem[]): AnalyseCounts {
  let vert = 0, jaune = 0, orange = 0, rouge = 0, unknown = 0
  for (const it of items) {
    switch (it.colorRating) {
      case 'Vert': vert++; break
      case 'Jaune': jaune++; break
      case 'Orange': orange++; break
      case 'Rouge': rouge++; break
      default: unknown++
    }
  }
  const total = items.length
  return { total, matched: total - unknown, vert, jaune, orange, rouge, unknown }
}

/** Score 0-20 reconstruit depuis items via la pastille propriétaire (couleur +
 *  position), synthétisée dans la bande du ton — même moteur que l'Edge analyser
 *  et le bulk catalogue. Ne s'applique qu'aux result_json incomplets (fallback). */
function reconstructScoreFromItems(items: AnalyseItem[]): number {
  if (items.length === 0) return 0
  const past = pastilleTone(
    items.map((it) => ({ color: it.colorRating, position: it.position })),
    items.length,
    false,
  )
  return synthScore(past) ?? 0
}

function scoreToneFromScore(score: number): ScoreTone {
  if (score >= 17) return 'green'
  if (score >= 13) return 'amber'
  if (score >= 9) return 'orange'
  return 'rose'
}

function scoreLabelTextFromScore(score: number): string {
  if (score >= 17) return 'Très bien'
  if (score >= 13) return 'Bien'
  if (score >= 9) return 'Moyen'
  return 'Faible'
}

/** Parse défensif du result_json (jsonb) en AnalyseResponse. */
export function parseAnalyseResponse(json: unknown): AnalyseResponse | null {
  if (!json || typeof json !== 'object') return null
  const r = json as Record<string, unknown>
  // `items` est le minimum vital : sans lui, l'analyse est irrécupérable.
  if (!Array.isArray(r.items)) return null

  // Défensif : des analyses cachées ont des champs ATTENDUS-tableau corrompus en
  // objet/scalaire (ex. `tags` enrichi Wikidata = objet). On les re-coerce en
  // tableau pour qu'aucune itération downstream (computeEssentiel, rendu) ne casse.
  r.items = (r.items as unknown[]).map((raw) => {
    if (!raw || typeof raw !== 'object') return raw
    const it = raw as Record<string, unknown>
    if ('tags' in it && !Array.isArray(it.tags)) it.tags = []
    if ('allFunctions' in it && !Array.isArray(it.allFunctions)) it.allFunctions = []
    return it
  })

  const items = r.items as AnalyseItem[]

  // Reconstruction des champs manquants (court-circuit cache incomplet).
  if (!r.counts || typeof r.counts !== 'object') r.counts = reconstructCounts(items)
  if (typeof r.score !== 'number') r.score = reconstructScoreFromItems(items)
  if (typeof r.scoreLabel !== 'string') r.scoreLabel = scoreLabelTextFromScore(r.score as number)
  if (typeof r.scoreTone !== 'string') r.scoreTone = scoreToneFromScore(r.score as number)
  if (!Array.isArray(r.observations)) r.observations = []
  // Spectre : reconstruit depuis items (5/10 premières positions) si absent/vide
  // (certaines lignes servies par le court-circuit cache n'ont pas de spectrum).
  const sp = r.spectrum as { top5?: unknown[] } | null | undefined
  if (!sp || typeof sp !== 'object' || !Array.isArray(sp.top5) || sp.top5.length === 0) {
    const sorted = [...items].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    const pick = (n: number): (DbColorRating | null)[] =>
      Array.from({ length: Math.min(n, sorted.length) }, (_, i) => sorted[i]?.colorRating ?? null)
    r.spectrum = { top5: pick(5), top10: pick(10) }
  }
  if (!('synthesis' in r)) r.synthesis = null

  return json as AnalyseResponse
}
