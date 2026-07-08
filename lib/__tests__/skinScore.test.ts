/**
 * Score de peau : couche pure (lib/skin/score.ts).
 *
 * Ces tests verrouillent les décisions du design "Ma peau" :
 *   - convention 100 = idéal sur TOUTES les dimensions (pas d'inversion) ;
 *   - questionnaire : index de réponse 0..4 -> score par pas de 25 ;
 *   - headline : blend 0.6 check-in / 0.4 scan UNIQUEMENT si le scan a moins
 *     de 14 jours, sinon check-in seul ; scan seul sans check-in ; null sans
 *     donnée ;
 *   - delta hebdo : comparaison avec le headline d'avant le lundi ISO courant ;
 *   - timeline : fusion triée STABLE (déterminisme du graphe) ;
 *   - insightLine : phrases FR sans chiffre de dimension et SANS tiret
 *     cadratin (sonde construite via String.fromCharCode, jamais en littéral).
 */
import {
  SKIN_DIMENSIONS,
  answersToScores,
  buildTimeline,
  globalScore,
  headlineScore,
  insightLine,
  weeklyDelta,
  type DimScores,
  type SkinPoint,
} from '@/lib/skin/score'

const DAY_MS = 86_400_000
const EM_DASH = String.fromCharCode(0x2014)

// Mardi 7 juillet 2026, midi HEURE LOCALE (loin des frontières de semaine ISO
// et de jour, pour être insensible au fuseau de la machine de CI).
const NOW = new Date(2026, 6, 7, 12, 0, 0)

function dims(v: number): DimScores {
  return { imperfections: v, rougeurs: v, secheresse: v, brillance: v, douceur: v }
}

function point(
  date: string,
  source: 'checkin' | 'scan',
  global: number,
  partial?: Partial<DimScores>,
): SkinPoint {
  return { date, source, global, dims: { ...dims(global), ...partial } }
}

/** Date ISO à `days` jours avant NOW. */
function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * DAY_MS).toISOString()
}

describe('answersToScores : questionnaire -> scores', () => {
  it('index 0 (pire) -> 0, index 4 (Aucune) -> 100, pas de 25', () => {
    expect(answersToScores([0, 1, 2, 3, 4])).toEqual({
      imperfections: 0,
      rougeurs: 25,
      secheresse: 50,
      brillance: 75,
      douceur: 100,
    })
  })

  it('réponse manquante ou hors bornes -> défensif (0 ou borné)', () => {
    const partial = answersToScores([4])
    expect(partial.imperfections).toBe(100)
    expect(partial.rougeurs).toBe(0)
    const outOfRange = answersToScores([-2, 9, 2, 2, 2])
    expect(outOfRange.imperfections).toBe(0)
    expect(outOfRange.rougeurs).toBe(100)
  })
})

describe('globalScore : moyenne arrondie', () => {
  it('moyenne exacte', () => {
    expect(
      globalScore({ imperfections: 0, rougeurs: 25, secheresse: 50, brillance: 75, douceur: 100 }),
    ).toBe(50)
  })

  it('arrondi (374 / 5 = 74.8 -> 75)', () => {
    expect(
      globalScore({ imperfections: 60, rougeurs: 70, secheresse: 80, brillance: 90, douceur: 74 }),
    ).toBe(75)
  })

  it('valeurs hors bornes clampées avant moyenne', () => {
    expect(
      globalScore({ imperfections: 150, rougeurs: -50, secheresse: 50, brillance: 50, douceur: 50 }),
    ).toBe(50)
  })
})

describe('headlineScore : blend 0.6 check-in / 0.4 scan', () => {
  it('scan à 13 jours -> blend arrondi, blended = true', () => {
    const points = [point(daysAgo(20), 'checkin', 80), point(daysAgo(13), 'scan', 60)]
    expect(headlineScore(points, NOW)).toEqual({ score: 72, blended: true })
  })

  it('scan à 15 jours -> check-in seul, blended = false', () => {
    const points = [point(daysAgo(5), 'checkin', 80), point(daysAgo(15), 'scan', 60)]
    expect(headlineScore(points, NOW)).toEqual({ score: 80, blended: false })
  })

  it('scan seul sans check-in -> score du scan, blended = false', () => {
    const points = [point(daysAgo(3), 'scan', 64)]
    expect(headlineScore(points, NOW)).toEqual({ score: 64, blended: false })
  })

  it('aucune donnée -> score null', () => {
    expect(headlineScore([], NOW)).toEqual({ score: null, blended: false })
  })
})

describe('weeklyDelta : headline courant vs avant le lundi ISO', () => {
  it('amélioration -> delta positif', () => {
    const points = [
      point(new Date(2026, 5, 30, 12).toISOString(), 'checkin', 70), // mardi semaine précédente
      point(NOW.toISOString(), 'checkin', 74),
    ]
    expect(weeklyDelta(points, NOW)).toBe(4)
  })

  it('dégradation -> delta négatif', () => {
    const points = [
      point(new Date(2026, 5, 30, 12).toISOString(), 'checkin', 80),
      point(NOW.toISOString(), 'checkin', 74),
    ]
    expect(weeklyDelta(points, NOW)).toBe(-6)
  })

  it('aucun point antérieur au lundi courant -> null', () => {
    const points = [point(NOW.toISOString(), 'checkin', 74)]
    expect(weeklyDelta(points, NOW)).toBeNull()
  })

  it('aucune donnée -> null', () => {
    expect(weeklyDelta([], NOW)).toBeNull()
  })
})

describe('buildTimeline : fusion triée stable', () => {
  it('trie par date croissante toutes sources confondues', () => {
    const c1 = point(daysAgo(1), 'checkin', 70)
    const c2 = point(daysAgo(10), 'checkin', 60)
    const s1 = point(daysAgo(5), 'scan', 65)
    const timeline = buildTimeline([c1, c2], [s1])
    expect(timeline.map((p) => p.date)).toEqual([c2.date, s1.date, c1.date])
  })

  it('tri STABLE : à date égale, check-in avant scan (ordre d\'entrée)', () => {
    const sameDate = daysAgo(2)
    const checkin = point(sameDate, 'checkin', 70)
    const scan = point(sameDate, 'scan', 66)
    const timeline = buildTimeline([checkin], [scan])
    expect(timeline.map((p) => p.source)).toEqual(['checkin', 'scan'])
  })
})

describe('insightLine : phrases FR déterministes', () => {
  it('amélioration des rougeurs à une semaine d\'écart', () => {
    const points = [
      point(daysAgo(7), 'checkin', 60, { rougeurs: 50 }),
      point(daysAgo(0), 'checkin', 70, { rougeurs: 80 }),
    ]
    expect(insightLine(points, 'rougeurs')).toBe('Moins de rougeurs que la semaine dernière.')
  })

  it('amélioration de la douceur à un mois d\'écart (exemple du design)', () => {
    const points = [
      point(daysAgo(30), 'checkin', 60, { douceur: 50 }),
      point(daysAgo(0), 'checkin', 70, { douceur: 75 }),
    ]
    expect(insightLine(points, 'douceur')).toBe('Peau plus douce que le mois dernier.')
  })

  it('dégradation -> formulation douce, jamais culpabilisante', () => {
    const points = [
      point(daysAgo(7), 'checkin', 80, { imperfections: 75 }),
      point(daysAgo(0), 'checkin', 70, { imperfections: 50 }),
    ]
    expect(insightLine(points, 'imperfections')).toBe(
      "Un peu plus d'imperfections que la semaine dernière.",
    )
  })

  it('point unique -> null', () => {
    expect(insightLine([point(daysAgo(0), 'checkin', 70)], 'global')).toBeNull()
    expect(insightLine([], 'rougeurs')).toBeNull()
  })

  it('aucune sortie ne contient de tiret cadratin ni de chiffre de dimension', () => {
    const allDims = ['global', ...SKIN_DIMENSIONS] as const
    const scenarios: Array<[SkinPoint, SkinPoint]> = [
      // amélioration
      [point(daysAgo(7), 'checkin', 50), point(daysAgo(0), 'checkin', 80)],
      // dégradation
      [point(daysAgo(30), 'checkin', 80), point(daysAgo(0), 'checkin', 50)],
      // stabilité
      [point(daysAgo(90), 'checkin', 70), point(daysAgo(0), 'checkin', 70)],
    ]
    for (const [prev, last] of scenarios) {
      for (const dim of allDims) {
        const line = insightLine([prev, last], dim)
        expect(line).not.toBeNull()
        expect((line as string).includes(EM_DASH)).toBe(false)
        expect(line).not.toMatch(/\d/)
      }
    }
  })
})
