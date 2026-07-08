/**
 * Score global d'un scan visage (face-analyze/lib/score.ts).
 *
 * WHAT : vérifie que scanGlobal renvoie la moyenne ARRONDIE des 5 dimensions,
 * chacune bornée à [0, 100] (convention 100 = idéal, décision n°5 du design).
 * WHY : c'est ce global qui alimente le blend headline côté client ; un arrondi
 * ou un clamp incorrect décalerait tout l'affichage. Le module étant une FEUILLE
 * Deno zéro-import, on l'importe en RELATIF (pattern coherenceAbsenceGuard).
 */
import { scanGlobal, type ScanDimScores } from '../../supabase/functions/face-analyze/lib/score'

function dims(partial: Partial<ScanDimScores>): ScanDimScores {
  return { imperfections: 0, rougeurs: 0, secheresse: 0, brillance: 0, douceur: 0, ...partial }
}

describe('scanGlobal : moyenne arrondie et clampée', () => {
  it('moyenne exacte des 5 dimensions', () => {
    expect(
      scanGlobal({ imperfections: 0, rougeurs: 25, secheresse: 50, brillance: 75, douceur: 100 }),
    ).toBe(50)
  })

  it('arrondit la moyenne (374 / 5 = 74.8 -> 75)', () => {
    expect(
      scanGlobal({ imperfections: 60, rougeurs: 70, secheresse: 80, brillance: 90, douceur: 74 }),
    ).toBe(75)
  })

  it('borne chaque dimension avant la moyenne (150 -> 100, -50 -> 0)', () => {
    expect(
      scanGlobal({ imperfections: 150, rougeurs: -50, secheresse: 50, brillance: 50, douceur: 50 }),
    ).toBe(50)
  })

  it('valeurs non finies traitées comme 0', () => {
    expect(scanGlobal(dims({ imperfections: Number.NaN, douceur: 100 }))).toBe(20)
  })

  it('toutes à 100 -> 100', () => {
    expect(
      scanGlobal({
        imperfections: 100,
        rougeurs: 100,
        secheresse: 100,
        brillance: 100,
        douceur: 100,
      }),
    ).toBe(100)
  })
})
