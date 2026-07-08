/**
 * Graphe d'évolution du score de peau : mapping PUR SkinPoint -> chemins SVG.
 *
 * Le composant SkinGraph (components/peau/SkinGraph.tsx) délègue TOUT le calcul
 * ici : filtrage par période (3/6/12 mois), extraction d'une série par
 * dimension, et conversion en chemins SVG lissés (Catmull-Rom converti en
 * béziers cubiques). Aucune dépendance RN/SVG : uniquement des chaînes et des
 * nombres, donc 100 % testable en Jest node.
 *
 * Convention d'axes : x = temps linéaire (fallback index si dates dégénérées,
 * pour garantir un x STRICTEMENT croissant), y INVERSÉ (valeur 100 = haut du
 * graphe, 0 = bas), les valeurs étant des scores où 100 = idéal.
 */
import type { SkinDimension, SkinPoint } from '@/lib/skin/score'

export type GraphSeriesPoint = { date: string; value: number }

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function clampScore(v: number): number {
  if (!Number.isFinite(v)) return 0
  return Math.min(100, Math.max(0, v))
}

/** Série (date, valeur) pour une dimension donnée ou le global. */
export function seriesFor(
  points: SkinPoint[],
  dim: 'global' | SkinDimension,
): GraphSeriesPoint[] {
  return points.map((p) => ({
    date: p.date,
    value: dim === 'global' ? p.global : p.dims[dim],
  }))
}

/**
 * Points dont la date est dans les `months` derniers mois (bornes des
 * PeriodTabs : 3 mois / 6 mois / 1 an). Les dates non parsables sont exclues.
 */
export function filterByPeriod(
  points: SkinPoint[],
  months: 3 | 6 | 12,
  now: Date = new Date(),
): SkinPoint[] {
  const cutoff = new Date(now.getTime())
  cutoff.setMonth(cutoff.getMonth() - months)
  const cutoffMs = cutoff.getTime()
  return points.filter((p) => {
    const t = Date.parse(p.date)
    return Number.isFinite(t) && t >= cutoffMs
  })
}

export type SmoothPathResult = {
  /** Chemin SVG de la courbe (M + segments C). */
  path: string
  /** Chemin fermé pour le dégradé sous la courbe (courbe + retour par le bas). */
  areaPath: string
  /** Coordonnées de chaque point (mêmes indices que la série d'entrée). */
  dots: Array<{ x: number; y: number }>
  /** Dernier point (mis en avant dans l'UI), null si série vide. */
  last: { x: number; y: number } | null
}

/**
 * Convertit une série en chemins SVG lissés (spline Catmull-Rom -> béziers
 * cubiques). x = temps linéaire entre la première et la dernière date ;
 * si les dates sont dégénérées (doublons, non croissantes, span nul), on
 * retombe sur un espacement par index pour GARANTIR un x strictement
 * croissant. y = 100 - valeur normalisée (100 en haut). 1 point = chemin
 * dégénéré valide (un M, un dot centré horizontalement).
 */
export function toSmoothPath(
  series: GraphSeriesPoint[],
  width: number,
  height: number,
  pad: number = 8,
): SmoothPathResult {
  const n = series.length
  if (n === 0) return { path: '', areaPath: '', dots: [], last: null }

  const innerW = Math.max(1, width - pad * 2)
  const innerH = Math.max(1, height - pad * 2)
  const bottom = round2(pad + innerH)

  const yFor = (value: number) => round2(pad + (1 - clampScore(value) / 100) * innerH)

  const times = series.map((p) => Date.parse(p.date))
  const strictlyIncreasing = times.every(
    (t, i) => Number.isFinite(t) && (i === 0 || t > (times[i - 1] as number)),
  )
  const t0 = times[0] as number
  const span = (times[n - 1] as number) - t0
  const useTime = strictlyIncreasing && span > 0

  const xFor = (i: number): number => {
    if (n === 1) return round2(pad + innerW / 2)
    if (!useTime) return round2(pad + (i / (n - 1)) * innerW)
    return round2(pad + (((times[i] as number) - t0) / span) * innerW)
  }

  const dots = series.map((p, i) => ({ x: xFor(i), y: yFor(p.value) }))
  const first = dots[0] as { x: number; y: number }
  const last = dots[n - 1] as { x: number; y: number }

  if (n === 1) {
    const path = `M ${first.x} ${first.y}`
    const areaPath = `M ${first.x} ${first.y} L ${first.x} ${bottom} Z`
    return { path, areaPath, dots, last }
  }

  let path = `M ${first.x} ${first.y}`
  for (let i = 0; i < n - 1; i++) {
    const p0 = dots[i - 1] ?? (dots[i] as { x: number; y: number })
    const p1 = dots[i] as { x: number; y: number }
    const p2 = dots[i + 1] as { x: number; y: number }
    const p3 = dots[i + 2] ?? p2
    const c1x = round2(p1.x + (p2.x - p0.x) / 6)
    const c1y = round2(p1.y + (p2.y - p0.y) / 6)
    const c2x = round2(p2.x - (p3.x - p1.x) / 6)
    const c2y = round2(p2.y - (p3.y - p1.y) / 6)
    path += ` C ${c1x} ${c1y} ${c2x} ${c2y} ${p2.x} ${p2.y}`
  }

  const areaPath = `${path} L ${last.x} ${bottom} L ${first.x} ${bottom} Z`
  return { path, areaPath, dots, last }
}
