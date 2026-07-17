/**
 * Couverture des objectifs — moteur DÉTERMINISTE (edge core, pur).
 *
 * Prouve les invariants exigés par le user :
 *  - un produit NON pertinent (déo vs hydratation) ne compte JAMAIS ;
 *  - un objectif libre (« belle dentition ») accepte un produit hors profil
 *    (dentifrice) ;
 *  - la qualité (étoiles 1→5) et la fréquence pondèrent la couverture ;
 *  - la couverture SATURE (jamais > 100), monte avec de bons produits ;
 *  - les signatures détectent ajout/retrait/fréquence et changement d'objectifs.
 */
import {
  clampContribution,
  collectGoals,
  computeCoverage,
  COVERAGE_TAU,
  coverageTone,
  customGoalKey,
  djb2,
  frequencyFactor,
  goalsSignature,
  hasAnyGoal,
  isDeterministicGoal,
  metaCoverage,
  pairNeedsAI,
  qualityFactor,
  resolveProductAxis,
  routineSignature,
  saturate,
  starsFromScore,
  type GoalInput,
  type ProductAxis,
  type ProductInput,
} from '../../supabase/functions/goals-coverage/core'
import { categoryToAxis } from '../../supabase/functions/personal-insights/relevance'

// ── Helpers ──────────────────────────────────────────────────────────────────
const prod = (
  key: string,
  axis: ProductAxis,
  stars: number,
  frequency: ProductInput['frequency'] = 'daily',
): ProductInput => ({ key, axis, stars, frequency })

const goal = (key: string, axis: GoalInput['axis'], isCustom = false): GoalInput => ({
  key,
  label: key,
  axis,
  isCustom,
})

/** Contribution depuis une table { "productKey|goalKey": 0..3 }. */
const contribFrom = (table: Record<string, number>) => (pk: string, gk: string) =>
  table[`${pk}|${gk}`] ?? 0

// ── collectGoals ─────────────────────────────────────────────────────────────
describe('collectGoals', () => {
  it('rassemble les objectifs prédéfinis de TOUS les groupes (parties hautes incluses)', () => {
    const goals = collectGoals({ goals: ['hydrater_profondeur', 'cheveux_brillants', 'proteger_soleil'] })
    expect(goals.map((g) => g.key)).toEqual([
      'hydrater_profondeur',
      'cheveux_brillants',
      'proteger_soleil',
    ])
    expect(goals.find((g) => g.key === 'hydrater_profondeur')?.axis).toBe('skin')
    expect(goals.find((g) => g.key === 'cheveux_brillants')?.axis).toBe('hair')
    expect(goals.every((g) => !g.isCustom)).toBe(true)
  })

  it('ajoute les objectifs libres des 5 champs « Autre » après les prédéfinis', () => {
    const goals = collectGoals({
      goals: ['hydrater_profondeur'],
      otherGoals: 'Avoir une belle dentition',
      otherGoalsFace: 'Moins de points noirs',
    })
    expect(goals[0].key).toBe('hydrater_profondeur')
    const custom = goals.filter((g) => g.isCustom)
    expect(custom).toHaveLength(2)
    expect(custom[0].label).toBe('Avoir une belle dentition')
    expect(custom[0].axis).toBe('meta')
    expect(custom[0].key.startsWith('free:')).toBe(true)
  })

  it('dédoublonne les objectifs libres identiques (casse/accents ignorés) et cappe à 5', () => {
    const goals = collectGoals({
      otherGoals: 'Belle dentition',
      otherGoalsFace: 'BELLE  DENTITION', // doublon normalisé
      otherGoalsBody: 'Objectif A',
      otherGoalsHair: 'Objectif B',
      otherGoalsRoutine: 'Objectif C',
    })
    // 1 (dentition dédoublonnée) + 3 = 4 objectifs libres uniques
    expect(goals.filter((g) => g.isCustom)).toHaveLength(4)
  })

  it('ignore les slugs prédéfinis inconnus et déduplique', () => {
    const goals = collectGoals({ goals: ['hydrater_profondeur', 'hydrater_profondeur', 'inconnu_xyz'] })
    expect(goals.map((g) => g.key)).toEqual(['hydrater_profondeur'])
  })

  it('hasAnyGoal reflète la présence d’au moins un objectif', () => {
    expect(hasAnyGoal({})).toBe(false)
    expect(hasAnyGoal({ goals: [] })).toBe(false)
    expect(hasAnyGoal({ otherGoals: '   ' })).toBe(false)
    expect(hasAnyGoal({ goals: ['peau_douce'] })).toBe(true)
    expect(hasAnyGoal({ otherGoals: 'Autre chose' })).toBe(true)
  })
})

// ── starsFromScore / facteurs ────────────────────────────────────────────────
describe('starsFromScore & facteurs', () => {
  it('mappe la note /20 en étoiles', () => {
    expect(starsFromScore(18)).toBe(5)
    expect(starsFromScore(17)).toBe(5)
    expect(starsFromScore(13)).toBe(4)
    expect(starsFromScore(9)).toBe(3)
    expect(starsFromScore(5)).toBe(2)
    expect(starsFromScore(2)).toBe(1)
    expect(starsFromScore(null)).toBe(3) // inconnu → neutre
  })

  it('la qualité décroît avec les étoiles', () => {
    expect(qualityFactor(5)).toBeGreaterThan(qualityFactor(4))
    expect(qualityFactor(4)).toBeGreaterThan(qualityFactor(3))
    expect(qualityFactor(3)).toBeGreaterThan(qualityFactor(2))
    expect(qualityFactor(2)).toBeGreaterThan(qualityFactor(1))
  })

  it('la fréquence pondère daily > weekly > monthly', () => {
    expect(frequencyFactor('daily')).toBeGreaterThan(frequencyFactor('weekly'))
    expect(frequencyFactor('weekly')).toBeGreaterThan(frequencyFactor('monthly'))
  })
})

// ── pré-filtre pertinence ────────────────────────────────────────────────────
describe('pairNeedsAI (pré-filtre déterministe)', () => {
  it('un objectif peau exige un produit peau', () => {
    expect(pairNeedsAI('skin', 'skin')).toBe(true)
    expect(pairNeedsAI('hair', 'skin')).toBe(false)
    expect(pairNeedsAI('none', 'skin')).toBe(false) // déo vs hydratation → 0
  })
  it('un objectif cheveux exige un produit cheveux', () => {
    expect(pairNeedsAI('hair', 'hair')).toBe(true)
    expect(pairNeedsAI('skin', 'hair')).toBe(false)
    expect(pairNeedsAI('none', 'hair')).toBe(false)
  })
  it('un objectif meta/libre accepte TOUT produit (dentifrice = none)', () => {
    expect(pairNeedsAI('none', 'meta')).toBe(true)
    expect(pairNeedsAI('skin', 'meta')).toBe(true)
    expect(pairNeedsAI('hair', 'meta')).toBe(true)
  })
  it('un produit à catégorie inconnue est TOUJOURS confié à l’IA (jamais pré-exclu)', () => {
    expect(pairNeedsAI('unknown', 'skin')).toBe(true)
    expect(pairNeedsAI('unknown', 'hair')).toBe(true)
    expect(pairNeedsAI('unknown', 'meta')).toBe(true)
  })
})

describe('resolveProductAxis (classifieur categoryToAxis injecté)', () => {
  it('unknown quand aucune catégorie renseignée', () => {
    expect(resolveProductAxis(categoryToAxis, null, undefined, '')).toBe('unknown')
  })
  it('prend le premier axe peau/cheveux trouvé (le plus précis d’abord)', () => {
    expect(resolveProductAxis(categoryToAxis, 'coiffure', null)).toBe('hair')
    expect(resolveProductAxis(categoryToAxis, 'soin-du-corps-et-visage', null)).toBe('skin')
    // Précis d'abord : un précis peau prime sur une racine none
    expect(resolveProductAxis(categoryToAxis, 'serum hydratant visage', 'hygiene-du-corps/deodorant')).toBe('skin')
  })
  it('none pour une catégorie explicitement hors profil', () => {
    expect(resolveProductAxis(categoryToAxis, 'hygiene-du-corps/deodorant')).toBe('none')
    expect(resolveProductAxis(categoryToAxis, 'parfum')).toBe('none')
  })
  it('none pour la taxonomie catalogue RÉELLE des déos (pluriel, 3 niveaux)', () => {
    // Régression : le catalogue range les déos sous /deodorants/* (pluriel) ;
    // sans l'entrée dédiée ils retombaient sur la racine hygiene-du-corps = skin.
    expect(resolveProductAxis(categoryToAxis, 'hygiene-du-corps/deodorants/deodorant')).toBe('none')
    expect(resolveProductAxis(categoryToAxis, 'hygiene-du-corps/deodorants/poudre')).toBe('none')
    // Un gel douche surgras reste bien un soin peau (non affecté).
    expect(resolveProductAxis(categoryToAxis, 'hygiene-du-corps/gel-douche/douche-surgras')).toBe('skin')
  })
})

// ── saturate / tone ──────────────────────────────────────────────────────────
describe('saturate & coverageTone', () => {
  it('borne [0..100], 0 pour somme nulle, monotone', () => {
    expect(saturate(0)).toBe(0)
    expect(saturate(-5)).toBe(0)
    expect(saturate(1000)).toBe(100)
    expect(saturate(2)).toBeGreaterThan(saturate(1))
    expect(saturate(6)).toBeGreaterThan(saturate(3))
  })
  it('un produit fort quotidien 5★ (≈3 pts) donne une couverture élevée mais < 100', () => {
    const oneStrong = saturate(3) // 3 * 1.0 * 1.0
    expect(oneStrong).toBeGreaterThanOrEqual(70)
    expect(oneStrong).toBeLessThan(90)
  })
  it('mappe les tons comme la maquette', () => {
    expect(coverageTone(90)).toBe('vert')
    expect(coverageTone(70)).toBe('vert')
    expect(coverageTone(69)).toBe('jaune')
    expect(coverageTone(55)).toBe('jaune')
    expect(coverageTone(49)).toBe('orange')
    expect(coverageTone(40)).toBe('orange')
    expect(coverageTone(29)).toBe('rouge')
    expect(coverageTone(10)).toBe('rouge')
  })
  it('COVERAGE_TAU est exposé (constante figée)', () => {
    expect(COVERAGE_TAU).toBeGreaterThan(0)
  })
})

describe('clampContribution', () => {
  it('borne 0..3 entier', () => {
    expect(clampContribution(2.4)).toBe(2)
    expect(clampContribution(2.6)).toBe(3)
    expect(clampContribution(-1)).toBe(0)
    expect(clampContribution(9)).toBe(3)
    expect(clampContribution(NaN)).toBe(0)
  })
})

// ── computeCoverage (cœur métier) ────────────────────────────────────────────
describe('computeCoverage', () => {
  it('un déodorant (none) ne compte PAS pour l’hydratation, même si l’IA le notait fort', () => {
    const products = [prod('deo', 'none', 5)]
    const goals = [goal('hydrater_profondeur', 'skin')]
    // Même si une contribution traînait dans la table, le pré-filtre l'écarte.
    const table = contribFrom({ 'deo|hydrater_profondeur': 3 })
    const [cov] = computeCoverage(products, goals, table)
    expect(cov.percent).toBe(0)
    expect(cov.relevantCount).toBe(0)
  })

  it('un objectif libre « belle dentition » EST couvert par un dentifrice (none)', () => {
    const dentitionKey = customGoalKey('Belle dentition')
    const products = [prod('dentifrice', 'none', 5)]
    const goals = [goal(dentitionKey, 'meta', true)]
    const table = contribFrom({ [`dentifrice|${dentitionKey}`]: 3 })
    const [cov] = computeCoverage(products, goals, table)
    expect(cov.percent).toBeGreaterThanOrEqual(70)
    expect(cov.relevantCount).toBe(1)
  })

  it('un bon produit (5★) couvre mieux qu’un mauvais (1★) à contribution égale', () => {
    const goals = [goal('hydrater_profondeur', 'skin')]
    const [good] = computeCoverage([prod('g', 'skin', 5)], goals, contribFrom({ 'g|hydrater_profondeur': 3 }))
    const [bad] = computeCoverage([prod('b', 'skin', 1)], goals, contribFrom({ 'b|hydrater_profondeur': 3 }))
    expect(good.percent).toBeGreaterThan(bad.percent)
  })

  it('les produits non pertinents ne baissent JAMAIS la couverture', () => {
    const goals = [goal('hydrater_profondeur', 'skin')]
    const withOnlyRelevant = computeCoverage(
      [prod('serum', 'skin', 5)],
      goals,
      contribFrom({ 'serum|hydrater_profondeur': 3 }),
    )[0]
    const withNoise = computeCoverage(
      [prod('serum', 'skin', 5), prod('deo', 'none', 1), prod('shampoo', 'hair', 1)],
      goals,
      contribFrom({ 'serum|hydrater_profondeur': 3 }),
    )[0]
    expect(withNoise.percent).toBe(withOnlyRelevant.percent)
  })

  it('plusieurs bons produits saturent vers 100 sans dépasser', () => {
    const goals = [goal('hydrater_profondeur', 'skin')]
    const products = [
      prod('a', 'skin', 5),
      prod('b', 'skin', 5),
      prod('c', 'skin', 4),
    ]
    const table = contribFrom({
      'a|hydrater_profondeur': 3,
      'b|hydrater_profondeur': 3,
      'c|hydrater_profondeur': 2,
    })
    const [cov] = computeCoverage(products, goals, table)
    expect(cov.percent).toBeGreaterThanOrEqual(95)
    expect(cov.percent).toBeLessThanOrEqual(100)
    expect(cov.relevantCount).toBe(3)
  })

  it('un objectif cheveux ne compte que les produits cheveux', () => {
    const goals = [goal('cheveux_brillants', 'hair')]
    const products = [prod('serum_visage', 'skin', 5), prod('masque_cheveux', 'hair', 4)]
    const table = contribFrom({
      'serum_visage|cheveux_brillants': 3, // ignoré (pré-filtre)
      'masque_cheveux|cheveux_brillants': 3,
    })
    const [cov] = computeCoverage(products, goals, table)
    expect(cov.relevantCount).toBe(1)
    expect(cov.percent).toBeGreaterThan(0)
  })

  it('couverture 0 quand aucun produit ne sert l’objectif (protection solaire sans SPF)', () => {
    const goals = [goal('proteger_soleil', 'skin')]
    const products = [prod('creme', 'skin', 4)]
    const table = contribFrom({ 'creme|proteger_soleil': 0 }) // l'IA dit : ne protège pas
    const [cov] = computeCoverage(products, goals, table)
    expect(cov.percent).toBe(0)
    expect(cov.tone).toBe('rouge')
  })

  it('préserve l’ordre des objectifs fourni', () => {
    const goals = [
      goal('hydrater_profondeur', 'skin'),
      goal('reduire_rides', 'skin'),
      goal('cheveux_brillants', 'hair'),
    ]
    const cov = computeCoverage([], goals, contribFrom({}))
    expect(cov.map((c) => c.key)).toEqual([
      'hydrater_profondeur',
      'reduire_rides',
      'cheveux_brillants',
    ])
    expect(cov.every((c) => c.percent === 0)).toBe(true)
  })
})

// ── objectifs méta déterministes ─────────────────────────────────────────────
describe('objectifs méta (déterministes, sans IA)', () => {
  const many = (n: number, stars = 4) => Array.from({ length: n }, (_, i) => prod(`p${i}`, 'skin', stars))

  it('isDeterministicGoal cible decouvrir_clean (simplifier_routine retiré du bloc)', () => {
    expect(isDeterministicGoal('decouvrir_clean')).toBe(true)
    expect(isDeterministicGoal('simplifier_routine')).toBe(false)
    expect(isDeterministicGoal('hydrater_profondeur')).toBe(false)
    expect(isDeterministicGoal('free:abc')).toBe(false)
  })

  it('simplifier_routine est EXCLU du bloc : collectGoals l’ignore et metaCoverage renvoie null', () => {
    // Retiré le 17 juil 2026 : « simplifier » n'est pas une couverture mesurable.
    // Sélectionnable dans le profil mais absent des jauges → jamais dans collectGoals.
    expect(collectGoals({ goals: ['peau_douce', 'simplifier_routine'] }).map((g) => g.key)).toEqual([
      'peau_douce',
    ])
    expect(metaCoverage('simplifier_routine', many(3))).toBeNull()
  })

  it('decouvrir_clean : part de produits ≥ 4★', () => {
    const products = [prod('a', 'skin', 5), prod('b', 'skin', 4), prod('c', 'none', 2), prod('d', 'none', 1)]
    const m = metaCoverage('decouvrir_clean', products)!
    expect(m.relevantCount).toBe(2)
    expect(m.percent).toBe(50)
  })

  it('metaCoverage renvoie null pour un objectif non méta', () => {
    expect(metaCoverage('hydrater_profondeur', [])).toBeNull()
  })

  it('computeCoverage IGNORE l’IA pour les méta (decouvrir_clean = part de bons produits, pas la contrib IA)', () => {
    // 2 bons (≥4★) sur 3 → 67 %, quelle que soit la contribution IA (ignorée pour les méta).
    const products = [prod('a', 'skin', 5), prod('b', 'skin', 4), prod('c', 'skin', 2)]
    const [cov] = computeCoverage(products, [goal('decouvrir_clean', 'meta')], () => 3)
    expect(cov.percent).toBe(67)
    expect(cov.relevantCount).toBe(2)
  })
})

// ── signatures ───────────────────────────────────────────────────────────────
describe('routineSignature', () => {
  it('est indépendante de l’ordre', () => {
    const a = routineSignature([
      { analysis_id: 'x', frequency: 'daily' },
      { analysis_id: 'y', frequency: 'weekly' },
    ])
    const b = routineSignature([
      { analysis_id: 'y', frequency: 'weekly' },
      { analysis_id: 'x', frequency: 'daily' },
    ])
    expect(a).toBe(b)
  })
  it('change à l’ajout, au retrait et au changement de fréquence', () => {
    const base = routineSignature([{ analysis_id: 'x', frequency: 'daily' }])
    const added = routineSignature([
      { analysis_id: 'x', frequency: 'daily' },
      { analysis_id: 'z', frequency: 'daily' },
    ])
    const removed = routineSignature([])
    const freqChanged = routineSignature([{ analysis_id: 'x', frequency: 'weekly' }])
    expect(added).not.toBe(base)
    expect(removed).not.toBe(base)
    expect(freqChanged).not.toBe(base)
  })
  it('ignore les entrées sans analysis_id', () => {
    const sig = routineSignature([
      { analysis_id: '', frequency: 'daily' },
      { analysis_id: 'x', frequency: 'daily' },
    ])
    expect(sig).toBe('x:daily')
  })
})

describe('goalsSignature', () => {
  it('est indépendante de l’ordre et change à l’ajout/retrait', () => {
    const a = goalsSignature([goal('a', 'skin'), goal('b', 'hair')])
    const b = goalsSignature([goal('b', 'hair'), goal('a', 'skin')])
    expect(a).toBe(b)
    expect(goalsSignature([goal('a', 'skin')])).not.toBe(a)
  })
})

describe('djb2 / customGoalKey', () => {
  it('est déterministe et insensible casse/accents', () => {
    expect(djb2('abc')).toBe(djb2('abc'))
    expect(customGoalKey('Belle Dentition')).toBe(customGoalKey('belle  dentition'))
    expect(customGoalKey('éclat')).toBe(customGoalKey('eclat'))
    expect(customGoalKey('a').startsWith('free:')).toBe(true)
  })
})
