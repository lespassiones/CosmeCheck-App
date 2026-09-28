/**
 * Note unique par produit (28 sept 2026, retour bêta Stela).
 *
 * Verrouille :
 *   1. referenceScore / servedProductScore (analyser/score.ts) : la note servie
 *      est celle du moteur sur les ingrédients affichés (≥ 50 % identifiés),
 *      sinon la note catalogue ; catalogue sans note → moteur.
 *   2. Le cas réel « pielsana gel de ducha » (EAN 11831525) : 17,34 au
 *      catalogue, 7,44 pour le moteur (2 rouges en queue + 3 orange).
 *   3. Le plafond couleur client (applyColorCap) est une IDENTITÉ sur toute
 *      note produite par le moteur : une fois la base alignée, il ne peut plus
 *      faire diverger la liste et la fiche.
 *   4. Chemin rapide (alternative tapée / favori) : note du catalogue, jamais
 *      0 inventé, libellé et tonalité recalculés.
 *   5. Évolution de l'exposition (moyenne) après un ajout.
 */
import {
  pastilleTone,
  referenceScore,
  servedProductScore,
  synthScore,
  type ColorRating,
} from '../../supabase/functions/analyser/score'
import { applyColorCap } from '@/lib/analysis/scoreCap'
import { alignCachedResult } from '@/lib/analysis/fastPathRow'
import {
  exposureChange,
  exposureChangeText,
  nextExposureHistory,
  routineSignature,
  type ExposureHistory,
} from '@/lib/routine/exposureDelta'

const L: Record<string, ColorRating | null> = { V: 'Vert', J: 'Jaune', O: 'Orange', R: 'Rouge', _: null }
const items = (seq: string) => [...seq].map((c, i) => ({ colorRating: L[c], position: i + 1 }))

describe('note de référence (moteur sur les ingrédients affichés)', () => {
  it('pielsana (EAN 11831525) : 7,44 « Faible » et non 17,34', () => {
    // Couleurs réelles de la fiche : AQUA, SLES, CAPB, ... MIT, MCI en queue.
    const pielsana = items('VOJVVOVJVOVVVVRR')
    expect(referenceScore(pielsana)).toBe(7.44)
    expect(servedProductScore(17.34, pielsana, 17.34)).toBe(7.44)
  })

  it("moins de 50 % d'ingrédients identifiés : la note catalogue reste", () => {
    const partial = items('VV____')
    expect(referenceScore(partial)).toBeNull()
    expect(servedProductScore(12.5, partial, 20)).toBe(12.5)
  })

  it('catalogue sans note (retirée volontairement) : le moteur', () => {
    expect(servedProductScore(null, items('VVVV'), 18.2)).toBe(18.2)
  })

  it("liste vide : pas de note de référence", () => {
    expect(referenceScore([])).toBeNull()
  })
})

describe('plafond couleur = identité sur les notes du moteur', () => {
  // Toutes les séquences de 1 à 7 ingrédients sur {V, J, O, R} : 21 844 cas.
  const alphabet = ['V', 'J', 'O', 'R']
  const seqs: string[] = []
  const gen = (prefix: string, n: number) => {
    if (prefix.length === n) { seqs.push(prefix); return }
    for (const a of alphabet) gen(prefix + a, n)
  }
  for (let n = 1; n <= 7; n++) gen('', n)

  it('applyColorCap(note moteur, compteurs moteur) == note moteur', () => {
    let checked = 0
    for (const s of seqs) {
      const colored = [...s].map((c, i) => ({ color: L[c], position: i }))
      const score = synthScore(pastilleTone(colored, colored.length, false))
      if (score == null) continue
      const o = [...s].filter((c) => c === 'O').length
      const r = [...s].filter((c) => c === 'R').length
      expect(applyColorCap(score, o, r)).toBe(score)
      checked++
    }
    expect(checked).toBe(seqs.length)
  })
})

describe('chemin rapide : note de la ligne insérée', () => {
  it('prend la note renvoyée par la RPC (catalogue) et recalcule libellé et tonalité', () => {
    const r = alignCachedResult({ score: 7.44, scoreLabel: 'Très bien', scoreTone: 'green', items: [] }, 17.34)
    expect(r.score).toBe(7.44)
    expect(r.resultJson.scoreLabel).toBe('Faible')
    expect(r.resultJson.scoreTone).toBe('orange')
    expect(r.resultJson.synthesis).toBeNull()
  })

  it('cache sans note : la note de la carte, jamais 0', () => {
    expect(alignCachedResult({ items: [] }, 16.3).score).toBe(16.3)
    expect(alignCachedResult({ items: [] }, null).score).toBeNull()
  })
})

describe("évolution de l'exposition (moyenne)", () => {
  const snap = (score: number, count: number, sig: string) => ({ score, count, sig })

  it('premier passage : aucun message', () => {
    const h = nextExposureHistory({ baseline: null, current: null }, snap(16.3, 6, 'a'))
    expect(exposureChange(h)).toEqual({ kind: 'none' })
  })

  it('ajout proche de la moyenne : « inchangée » (le cas de la bêta)', () => {
    let h: ExposureHistory = nextExposureHistory({ baseline: null, current: null }, snap(16.3, 6, 'a'))
    h = nextExposureHistory(h, snap(16.31, 7, 'b'))
    const c = exposureChange(h)
    expect(c.kind).toBe('same')
    expect(exposureChangeText(c)).toBe('Inchangée : tes ajouts ont une note proche de ta moyenne.')
  })

  it('ajout d’un produit mieux noté : « +0,4 »', () => {
    let h: ExposureHistory = nextExposureHistory({ baseline: null, current: null }, snap(15.2, 3, 'a'))
    h = nextExposureHistory(h, snap(15.6, 4, 'b'))
    expect(exposureChangeText(exposureChange(h))).toBe('+0,4 depuis ta dernière modification')
  })

  it('même routine revue : le message du dernier changement reste', () => {
    let h: ExposureHistory = nextExposureHistory({ baseline: null, current: null }, snap(15.2, 3, 'a'))
    h = nextExposureHistory(h, snap(14.1, 4, 'b'))
    h = nextExposureHistory(h, snap(14.1, 4, 'b'))
    expect(exposureChangeText(exposureChange(h))).toBe('-1,1 depuis ta dernière modification')
  })

  it("signature indépendante de l'ordre", () => {
    expect(routineSignature([{ analysisId: 'x', frequency: 'daily' }, { analysisId: 'a', frequency: 'weekly' }]))
      .toBe(routineSignature([{ analysisId: 'a', frequency: 'weekly' }, { analysisId: 'x', frequency: 'daily' }]))
  })
})
