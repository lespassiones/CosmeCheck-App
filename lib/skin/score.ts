/**
 * Score de peau : couche PURE (zéro I/O) du chantier "Ma peau".
 *
 * Convention verrouillée (décision n°5 du design) : TOUTES les dimensions sont
 * des scores où 100 = idéal (aucune imperfection, aucune rougeur, peau bien
 * hydratée, brillance maîtrisée, peau très douce). Le questionnaire, le prompt
 * IA du scan visage et le graphe suivent la même convention ; le global est la
 * moyenne arrondie des 5 dimensions. Aucune inversion de signe nulle part.
 *
 * Score headline (décision n°3, déterministe) : si un scan existe à moins de
 * 14 jours de `now`, headline = round(0.6 * checkinGlobal + 0.4 * scanGlobal)
 * (le questionnaire domine, le scan IA affine) ; sinon headline = checkinGlobal
 * seul ; scanGlobal seul s'il n'existe aucun check-in ; null sans donnée.
 *
 * Delta hebdo (décision n°4) : headline(maintenant) - headline(asOf = lundi de
 * la semaine ISO courante, points strictement antérieurs à ce lundi) ; null si
 * aucune donnée antérieure.
 *
 * Rappel copie : jamais de tiret cadratin, jamais de chiffre de dimension dans
 * les phrases utilisateur (insightLine). Le score PEAU /100 est lui autorisé
 * dans l'UI, mais pas dans ces phrases.
 */
import { startOfIsoWeek } from '@/lib/skin/week'

export const SKIN_DIMENSIONS = [
  'imperfections',
  'rougeurs',
  'secheresse',
  'brillance',
  'douceur',
] as const

export type SkinDimension = (typeof SKIN_DIMENSIONS)[number]

/** 5 dimensions 0-100, 100 = idéal. */
export type DimScores = Record<SkinDimension, number>

/** Point de la timeline peau (check-in hebdo OU scan visage IA). */
export type SkinPoint = {
  /** Date ISO (created_at DB). */
  date: string
  source: 'checkin' | 'scan'
  dims: DimScores
  /** Global 0-100 (moyenne arrondie des dims). */
  global: number
}

const DAY_MS = 86_400_000
/** Fenêtre de fraîcheur d'un scan pour le blend 0.6/0.4 (14 jours). */
const SCAN_BLEND_WINDOW_MS = 14 * DAY_MS

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, value))
}

/**
 * Réponses du bilan hebdo (index de l'option choisie, 0 = pire, 4 = "Aucune")
 * vers scores 0-100 par pas de 25, dans l'ordre SKIN_DIMENSIONS.
 * Défensif : réponse manquante ou invalide = 0 (pire cas), bornée à [0, 4].
 */
export function answersToScores(answers: number[]): DimScores {
  const out = {} as DimScores
  SKIN_DIMENSIONS.forEach((dim, i) => {
    const raw = answers[i]
    const idx =
      typeof raw === 'number' && Number.isFinite(raw)
        ? Math.min(4, Math.max(0, Math.round(raw)))
        : 0
    out[dim] = idx * 25
  })
  return out
}

/** Global = moyenne arrondie des 5 dimensions (chacune bornée à [0, 100]). */
export function globalScore(dims: DimScores): number {
  let sum = 0
  for (const dim of SKIN_DIMENSIONS) sum += clampScore(dims[dim])
  return Math.round(sum / SKIN_DIMENSIONS.length)
}

/**
 * Fusion check-ins + scans triée par date croissante. Tri STABLE : à date
 * égale, l'ordre d'entrée est conservé (check-ins d'abord, puis scans),
 * ce qui rend la timeline déterministe pour le graphe et les insights.
 */
export function buildTimeline(checkins: SkinPoint[], scans: SkinPoint[]): SkinPoint[] {
  return [...checkins, ...scans].sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
}

function latestOf(points: SkinPoint[], source: SkinPoint['source']): SkinPoint | null {
  let latest: SkinPoint | null = null
  for (const p of points) {
    if (p.source !== source) continue
    if (!latest || Date.parse(p.date) >= Date.parse(latest.date)) latest = p
  }
  return latest
}

/**
 * Score headline affiché (voir en-tête du module pour la formule).
 * `blended` = true uniquement quand le blend 0.6 check-in / 0.4 scan est actif
 * (l'UI affiche alors "Bilan + scan IA").
 */
export function headlineScore(
  points: SkinPoint[],
  now: Date = new Date(),
): { score: number | null; blended: boolean } {
  const lastCheckin = latestOf(points, 'checkin')
  const lastScan = latestOf(points, 'scan')

  if (!lastCheckin && !lastScan) return { score: null, blended: false }
  if (!lastCheckin && lastScan) {
    // Aucun check-in : le scan seul fait foi (même ancien, mieux que rien).
    return { score: Math.round(clampScore(lastScan.global)), blended: false }
  }
  const checkin = lastCheckin as SkinPoint
  if (lastScan && Math.abs(now.getTime() - Date.parse(lastScan.date)) <= SCAN_BLEND_WINDOW_MS) {
    return {
      score: Math.round(0.6 * clampScore(checkin.global) + 0.4 * clampScore(lastScan.global)),
      blended: true,
    }
  }
  return { score: Math.round(clampScore(checkin.global)), blended: false }
}

/**
 * Delta hebdo : headline(now) - headline(points strictement antérieurs au
 * lundi ISO courant, évalué asOf ce lundi). null si aucune donnée antérieure.
 */
export function weeklyDelta(points: SkinPoint[], now: Date = new Date()): number | null {
  const monday = startOfIsoWeek(now)
  const before = points.filter((p) => Date.parse(p.date) < monday.getTime())
  const previous = headlineScore(before, monday)
  if (previous.score === null) return null
  const current = headlineScore(points, now)
  if (current.score === null) return null
  return current.score - previous.score
}

/** Libellé de période selon l'écart entre les deux derniers points. */
function periodLabel(gapDays: number): string {
  if (gapDays <= 10) return 'la semaine dernière'
  if (gapDays <= 60) return 'le mois dernier'
  return 'la dernière fois'
}

type InsightDim = 'global' | SkinDimension

const IMPROVEMENT_LINE: Record<InsightDim, (period: string) => string> = {
  global: (p) => `Ta peau va mieux que ${p}.`,
  imperfections: (p) => `Moins d'imperfections que ${p}.`,
  rougeurs: (p) => `Moins de rougeurs que ${p}.`,
  secheresse: (p) => `Peau mieux hydratée que ${p}.`,
  brillance: (p) => `Brillance mieux maîtrisée que ${p}.`,
  douceur: (p) => `Peau plus douce que ${p}.`,
}

const DEGRADATION_LINE: Record<InsightDim, (period: string) => string> = {
  global: (p) => `Ta peau est un peu moins en forme que ${p}.`,
  imperfections: (p) => `Un peu plus d'imperfections que ${p}.`,
  rougeurs: (p) => `Un peu plus de rougeurs que ${p}.`,
  secheresse: (p) => `Peau un peu plus sèche que ${p}.`,
  brillance: (p) => `Peau un peu plus brillante que ${p}.`,
  douceur: (p) => `Peau un peu moins douce que ${p}.`,
}

/**
 * Phrase d'insight v1, déterministe : compare le DERNIER point au précédent
 * sur la dimension demandée (100 = idéal, donc valeur qui monte = mieux).
 * null si moins de deux points. Formulations SANS chiffre de dimension et
 * sans tiret cadratin (contrainte de copie globale de l'app).
 */
export function insightLine(points: SkinPoint[], dim: InsightDim): string | null {
  if (points.length < 2) return null
  const sorted = [...points].sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
  const last = sorted[sorted.length - 1] as SkinPoint
  const prev = sorted[sorted.length - 2] as SkinPoint
  const valueOf = (p: SkinPoint) => (dim === 'global' ? p.global : p.dims[dim])
  const gapDays = (Date.parse(last.date) - Date.parse(prev.date)) / DAY_MS
  const period = periodLabel(gapDays)
  const delta = valueOf(last) - valueOf(prev)
  if (delta > 0) return IMPROVEMENT_LINE[dim](period)
  if (delta < 0) return DEGRADATION_LINE[dim](period)
  return `Ta peau est stable par rapport à ${period}.`
}
