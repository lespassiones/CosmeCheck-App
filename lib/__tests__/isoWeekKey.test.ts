/**
 * Semaine ISO-8601 (lib/skin/week.ts) : module partagé bilans hebdo / rappels /
 * Pépites de la semaine.
 *
 * POURQUOI ces tests : les frontières d'année ISO sont le piège classique
 * (le 1er janvier peut appartenir à l'année ISO précédente, fin décembre à la
 * suivante). Une clé fausse casserait l'unicité DB (skin_checkins UNIQUE
 * user_id+week_key) et le déterminisme des pépites.
 */

import { isoWeekKey, isoWeekParts, isoWeekday, localDayKey, startOfIsoWeek } from '@/lib/skin/week'

describe('isoWeekKey', () => {
  it('rattache le 1er janvier 2021 à la semaine 53 de 2020 (année ISO précédente)', () => {
    expect(isoWeekKey(new Date(2021, 0, 1))).toBe('2020-W53')
  })

  it('rattache le 30 décembre 2024 à la semaine 1 de 2025 (année ISO suivante)', () => {
    expect(isoWeekKey(new Date(2024, 11, 30))).toBe('2025-W01')
  })

  it('jeudi 1er janvier 2026 = 2026-W01', () => {
    expect(isoWeekKey(new Date(2026, 0, 1))).toBe('2026-W01')
  })

  it('7 juillet 2026 = 2026-W28 (sanity date du jour du chantier)', () => {
    expect(isoWeekKey(new Date(2026, 6, 7))).toBe('2026-W28')
  })

  it('pad la semaine sur 2 chiffres (W05)', () => {
    // Lundi 26 janvier 2026 -> semaine 5.
    expect(isoWeekKey(new Date(2026, 0, 28))).toBe('2026-W05')
  })

  it('lundi et dimanche de la même semaine partagent la même clé', () => {
    expect(isoWeekKey(new Date(2026, 6, 6))).toBe(isoWeekKey(new Date(2026, 6, 12)))
    expect(isoWeekKey(new Date(2026, 6, 6))).toBe('2026-W28')
    // Et le lundi suivant bascule.
    expect(isoWeekKey(new Date(2026, 6, 13))).toBe('2026-W29')
  })

  it('isoWeekParts expose année ISO et numéro de semaine', () => {
    expect(isoWeekParts(new Date(2021, 0, 1))).toEqual({ year: 2020, week: 53 })
    expect(isoWeekParts(new Date(2026, 6, 7))).toEqual({ year: 2026, week: 28 })
  })
})

describe('localDayKey', () => {
  it('formate la date locale en YYYY-MM-DD (mois/jour paddés)', () => {
    expect(localDayKey(new Date(2026, 6, 7))).toBe('2026-07-07')
    expect(localDayKey(new Date(2026, 11, 25))).toBe('2026-12-25')
  })

  it('bascule chaque jour (deux jours consécutifs -> clés différentes)', () => {
    expect(localDayKey(new Date(2026, 6, 17))).not.toBe(localDayKey(new Date(2026, 6, 18)))
  })

  it('même jour, heures différentes -> même clé (stable dans la journée)', () => {
    expect(localDayKey(new Date(2026, 6, 17, 0, 5))).toBe(
      localDayKey(new Date(2026, 6, 17, 23, 55)),
    )
  })
})

describe('isoWeekday', () => {
  it('lundi = 1, dimanche = 7', () => {
    expect(isoWeekday(new Date(2026, 6, 6))).toBe(1) // lundi
    expect(isoWeekday(new Date(2026, 6, 12))).toBe(7) // dimanche
    expect(isoWeekday(new Date(2026, 6, 7))).toBe(2) // mardi
  })
})

describe('startOfIsoWeek', () => {
  it('renvoie le lundi 00:00 local de la semaine, y compris depuis un dimanche', () => {
    const fromSunday = startOfIsoWeek(new Date(2026, 6, 12, 22, 45))
    expect(fromSunday.getFullYear()).toBe(2026)
    expect(fromSunday.getMonth()).toBe(6)
    expect(fromSunday.getDate()).toBe(6)
    expect(fromSunday.getHours()).toBe(0)
    expect(fromSunday.getMinutes()).toBe(0)
  })

  it('est idempotent depuis un lundi', () => {
    const monday = startOfIsoWeek(new Date(2026, 6, 6, 9, 0))
    expect(monday.getDate()).toBe(6)
  })
})
