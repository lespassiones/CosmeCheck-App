/**
 * Planificateur du rappel de bilan (lib/notifications/planner.ts).
 *
 * POURQUOI ces tests : la programmation réelle passe par expo-notifications
 * (non testable en node, absente des binaires pré-rebuild) ; toute la logique
 * de décision vit donc dans ce module pur. Les pièges couverts sont les
 * classiques du domaine : bilan fait en début de semaine avec un rappel prévu
 * plus tard la MÊME semaine ISO (le one-shot doit sauter à la semaine
 * suivante), la frontière d'année ISO (semaine 53 qui chevauche janvier), et
 * la conversion de convention weekday ISO (1 = lundi) vers expo (1 = dimanche),
 * source récurrente de rappels au mauvais jour.
 */

import {
  computeNextBilanTrigger,
  conflictDedupKey,
  isoWeekdayToExpo,
} from '@/lib/notifications/planner'
import { isoWeekKey, isoWeekday } from '@/lib/skin/week'

/** Date cible d'un plan one-shot (now + seconds). */
function targetOf(now: Date, seconds: number): Date {
  return new Date(now.getTime() + seconds * 1000)
}

describe('computeNextBilanTrigger : bilan non fait cette semaine', () => {
  it('renvoie un trigger hebdo répétitif (minute 0) quand lastBilanWeek est null', () => {
    const now = new Date(2026, 6, 7, 10, 0) // mardi 7 juillet 2026, 2026-W28
    expect(computeNextBilanTrigger(now, 7, 18, null)).toEqual({
      kind: 'weekly',
      weekday: 7,
      hour: 18,
      minute: 0,
    })
  })

  it('renvoie un trigger hebdo quand le dernier bilan date d une semaine passée', () => {
    const now = new Date(2026, 6, 7, 10, 0) // 2026-W28
    expect(computeNextBilanTrigger(now, 3, 9, '2026-W27')).toEqual({
      kind: 'weekly',
      weekday: 3,
      hour: 9,
      minute: 0,
    })
  })
})

describe('computeNextBilanTrigger : bilan déjà fait cette semaine ISO', () => {
  it('renvoie un one-shot strictement futur visant une semaine ISO ultérieure', () => {
    const now = new Date(2026, 6, 7, 10, 0) // mardi, 2026-W28
    const plan = computeNextBilanTrigger(now, 7, 18, isoWeekKey(now))
    expect(plan.kind).toBe('one-shot')
    if (plan.kind !== 'one-shot') return
    expect(plan.seconds).toBeGreaterThan(0)
    const target = targetOf(now, plan.seconds)
    expect(isoWeekKey(target)).not.toBe(isoWeekKey(now))
  })

  it('bilan fait lundi, rappel prévu dimanche : saute le dimanche de la MÊME semaine', () => {
    // Lundi 6 juillet 2026 (2026-W28) : le dimanche 12 juillet est encore en
    // W28, le one-shot doit viser le dimanche 19 juillet (2026-W29).
    const now = new Date(2026, 6, 6, 10, 0)
    const plan = computeNextBilanTrigger(now, 7, 18, '2026-W28')
    expect(plan.kind).toBe('one-shot')
    if (plan.kind !== 'one-shot') return
    const target = targetOf(now, plan.seconds)
    expect(isoWeekKey(target)).toBe('2026-W29')
    expect(isoWeekday(target)).toBe(7) // dimanche
    expect(target.getHours()).toBe(18)
    expect(target.getMinutes()).toBe(0)
    expect(target.getDate()).toBe(19)
  })

  it('frontière d année ISO : bilan fait en 2026-W53, le one-shot vise 2027-W01', () => {
    // Mercredi 30 décembre 2026 = 2026-W53 (2026 commence un jeudi, 53 semaines).
    // Le dimanche suivant (3 janvier 2027) appartient ENCORE à 2026-W53 :
    // le one-shot doit sauter au dimanche 10 janvier 2027 (2027-W01).
    const now = new Date(2026, 11, 30, 10, 0)
    expect(isoWeekKey(now)).toBe('2026-W53') // garde-fou du scénario
    const plan = computeNextBilanTrigger(now, 7, 18, '2026-W53')
    expect(plan.kind).toBe('one-shot')
    if (plan.kind !== 'one-shot') return
    const target = targetOf(now, plan.seconds)
    expect(isoWeekKey(target)).toBe('2027-W01')
    expect(isoWeekday(target)).toBe(7)
    expect(target.getFullYear()).toBe(2027)
    expect(target.getDate()).toBe(10)
  })

  it('même jour, heure déjà passée : ne renvoie jamais un one-shot dans le passé', () => {
    // Dimanche 12 juillet 2026 à 20h, rappel dimanche 18h déjà passé.
    const now = new Date(2026, 6, 12, 20, 0)
    const plan = computeNextBilanTrigger(now, 7, 18, isoWeekKey(now))
    expect(plan.kind).toBe('one-shot')
    if (plan.kind !== 'one-shot') return
    expect(plan.seconds).toBeGreaterThan(0)
    const target = targetOf(now, plan.seconds)
    expect(target.getTime()).toBeGreaterThan(now.getTime())
    expect(isoWeekKey(target)).toBe('2026-W29')
  })
})

describe('isoWeekdayToExpo', () => {
  it('convertit ISO (1 = lundi) vers expo Calendar (1 = dimanche)', () => {
    expect(isoWeekdayToExpo(1)).toBe(2) // lundi
    expect(isoWeekdayToExpo(7)).toBe(1) // dimanche
    expect(isoWeekdayToExpo(6)).toBe(7) // samedi
  })
})

describe('conflictDedupKey', () => {
  it('est symétrique : (A, B) et (B, A) donnent la même clé', () => {
    const w = '2026-W28'
    expect(conflictDedupKey('Retinol Serum', 'Vitamine C', w)).toBe(
      conflictDedupKey('Vitamine C', 'Retinol Serum', w),
    )
  })

  it('normalise casse, accents et espaces superflus', () => {
    const w = '2026-W28'
    expect(conflictDedupKey('  RÉTINOL   Serum ', 'vitamine c', w)).toBe(
      conflictDedupKey('retinol serum', 'Vitamine C', w),
    )
  })

  it('une semaine différente produit une clé différente', () => {
    const a = conflictDedupKey('Retinol Serum', 'Vitamine C', '2026-W28')
    const b = conflictDedupKey('Retinol Serum', 'Vitamine C', '2026-W29')
    expect(a).not.toBe(b)
  })

  it('des paires de produits différentes produisent des clés différentes', () => {
    const w = '2026-W28'
    expect(conflictDedupKey('Retinol Serum', 'Vitamine C', w)).not.toBe(
      conflictDedupKey('Retinol Serum', 'AHA Peeling', w),
    )
  })
})
