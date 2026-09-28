/**
 * Heure de retour des crédits : minuit UTC (CURRENT_DATE Postgres) dit dans
 * l'heure locale. « à minuit » écrit en dur était faux d'1 à 2 h en France.
 */

import { creditsResetLabel, utcMidnightLocalLabel } from '@/lib/credits/resetLabel'

describe('utcMidnightLocalLabel', () => {
  it('France été (UTC+2) : 2 h', () => {
    expect(utcMidnightLocalLabel(120)).toBe('à 2 h')
  })
  it('France hiver (UTC+1) : 1 h', () => {
    expect(utcMidnightLocalLabel(60)).toBe('à 1 h')
  })
  it('UTC : minuit', () => {
    expect(utcMidnightLocalLabel(0)).toBe('à minuit')
  })
  it('demi-heures (Inde, UTC+5:30)', () => {
    expect(utcMidnightLocalLabel(330)).toBe('à 5 h 30')
  })
  it("à l'ouest (Montréal été, UTC-4) : 20 h la veille", () => {
    expect(utcMidnightLocalLabel(-240)).toBe('à 20 h')
  })
})

describe('creditsResetLabel', () => {
  it('quotidien', () => {
    expect(creditsResetLabel('daily', 120)).toBe('à 2 h')
  })
  it('hebdomadaire : lundi, ou dimanche soir à l’ouest', () => {
    expect(creditsResetLabel('weekly', 120)).toBe('lundi à 2 h')
    expect(creditsResetLabel('weekly', -240)).toBe('dimanche à 20 h')
  })
  it('mensuel', () => {
    expect(creditsResetLabel('monthly', 60)).toBe('le 1er du mois à 1 h')
  })
  it('période inconnue ou ponctuelle : rien', () => {
    expect(creditsResetLabel('one_time', 120)).toBeNull()
    expect(creditsResetLabel(null, 120)).toBeNull()
  })
})
