/**
 * Graphe d'évolution du score de peau (lib/skin/graph.ts).
 *
 * Ces tests verrouillent le contrat consommé par le composant SkinGraph :
 *   - filterByPeriod : bornes 3 / 6 / 12 mois des PeriodTabs ;
 *   - seriesFor : extraction de la bonne dimension (ou du global) ;
 *   - toSmoothPath : x STRICTEMENT croissant (garanti même sur dates
 *     dégénérées via le fallback index), y INVERSÉ (100 = haut du graphe),
 *     un point par dot, chemin dégénéré valide pour une série d'un seul
 *     point, area fermée pour le dégradé.
 */
import { filterByPeriod, seriesFor, toSmoothPath } from '@/lib/skin/graph'
import type { DimScores, SkinPoint } from '@/lib/skin/score'

// Mardi 7 juillet 2026, midi heure locale (stable quel que soit le fuseau).
const NOW = new Date(2026, 6, 7, 12, 0, 0)

function dims(v: number): DimScores {
  return { imperfections: v, rougeurs: v, secheresse: v, brillance: v, douceur: v }
}

function point(date: Date, global: number, partial?: Partial<DimScores>): SkinPoint {
  return {
    date: date.toISOString(),
    source: 'checkin',
    global,
    dims: { ...dims(global), ...partial },
  }
}

describe('filterByPeriod : bornes 3 / 6 / 12 mois', () => {
  const recent = point(new Date(2026, 6, 1, 12), 70) // 1er juillet 2026
  const fourMonths = point(new Date(2026, 2, 1, 12), 65) // 1er mars 2026
  const nineMonths = point(new Date(2025, 9, 1, 12), 60) // 1er octobre 2025
  const old = point(new Date(2025, 4, 1, 12), 55) // 1er mai 2025
  const all = [old, nineMonths, fourMonths, recent]

  it('3 mois : seul le point récent reste', () => {
    expect(filterByPeriod(all, 3, NOW)).toEqual([recent])
  })

  it('6 mois : récent + 4 mois', () => {
    expect(filterByPeriod(all, 6, NOW)).toEqual([fourMonths, recent])
  })

  it('12 mois : tout sauf le point de plus d\'un an', () => {
    expect(filterByPeriod(all, 12, NOW)).toEqual([nineMonths, fourMonths, recent])
  })
})

describe('seriesFor : extraction de dimension', () => {
  const p1 = point(new Date(2026, 5, 1, 12), 70, { rougeurs: 40, douceur: 90 })
  const p2 = point(new Date(2026, 6, 1, 12), 75, { rougeurs: 55, douceur: 85 })

  it('extrait la dimension demandée (rougeurs)', () => {
    expect(seriesFor([p1, p2], 'rougeurs')).toEqual([
      { date: p1.date, value: 40 },
      { date: p2.date, value: 55 },
    ])
  })

  it("'global' extrait le score global", () => {
    expect(seriesFor([p1, p2], 'global').map((s) => s.value)).toEqual([70, 75])
  })
})

describe('toSmoothPath : mapping SVG pur', () => {
  const WIDTH = 300
  const HEIGHT = 120
  const PAD = 8

  function makeSeries(values: number[]): { date: string; value: number }[] {
    return values.map((value, i) => ({
      date: new Date(2026, 5, 1 + i * 7, 12).toISOString(),
      value,
    }))
  }

  it('x strictement croissant sur des dates croissantes', () => {
    const { dots } = toSmoothPath(makeSeries([50, 60, 40, 70]), WIDTH, HEIGHT, PAD)
    for (let i = 1; i < dots.length; i++) {
      expect(dots[i].x).toBeGreaterThan(dots[i - 1].x)
    }
  })

  it('x strictement croissant MÊME à dates dupliquées (fallback index)', () => {
    const sameDate = new Date(2026, 5, 1, 12).toISOString()
    const series = [
      { date: sameDate, value: 50 },
      { date: sameDate, value: 60 },
      { date: sameDate, value: 70 },
    ]
    const { dots } = toSmoothPath(series, WIDTH, HEIGHT, PAD)
    for (let i = 1; i < dots.length; i++) {
      expect(dots[i].x).toBeGreaterThan(dots[i - 1].x)
    }
  })

  it('y inversé : 100 en haut (y = pad), 0 en bas (y = height - pad)', () => {
    const { dots } = toSmoothPath(makeSeries([100, 0]), WIDTH, HEIGHT, PAD)
    expect(dots[0].y).toBe(PAD)
    expect(dots[1].y).toBe(HEIGHT - PAD)
    expect(dots[0].y).toBeLessThan(dots[1].y)
  })

  it('un seul point : chemin dégénéré valide, dot centré, area fermée', () => {
    const { path, areaPath, dots, last } = toSmoothPath(makeSeries([80]), WIDTH, HEIGHT, PAD)
    expect(path.startsWith('M ')).toBe(true)
    expect(areaPath.endsWith('Z')).toBe(true)
    expect(dots).toHaveLength(1)
    expect(last).toEqual(dots[0])
  })

  it('dots.length = series.length et last = dernier dot', () => {
    const series = makeSeries([50, 55, 60, 58, 65])
    const { dots, last } = toSmoothPath(series, WIDTH, HEIGHT, PAD)
    expect(dots).toHaveLength(series.length)
    expect(last).toEqual(dots[dots.length - 1])
  })

  it('n points -> n-1 segments de bézier cubique, area fermée par le bas', () => {
    const { path, areaPath } = toSmoothPath(makeSeries([50, 55, 60, 58]), WIDTH, HEIGHT, PAD)
    const curves = path.split(' C ').length - 1
    expect(curves).toBe(3)
    expect(areaPath.startsWith(path)).toBe(true)
    expect(areaPath.endsWith('Z')).toBe(true)
  })

  it('série vide : sortie neutre', () => {
    expect(toSmoothPath([], WIDTH, HEIGHT, PAD)).toEqual({
      path: '',
      areaPath: '',
      dots: [],
      last: null,
    })
  })
})
