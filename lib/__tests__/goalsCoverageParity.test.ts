/**
 * PARITÉ client ↔ serveur pour la couverture des objectifs.
 *
 * Le client (lib/routine/goalsCoverage.ts) et le serveur
 * (supabase/functions/goals-coverage/core.ts) ré-implémentent la MÊME logique
 * partagée (clés d'objectifs, signatures, version). Ce test importe les DEUX et
 * prouve qu'ils produisent des sorties identiques — sinon le bouton reload / la
 * fraîcheur seraient faux (recalculs à l'infini ou jamais).
 */
import * as core from '../../supabase/functions/goals-coverage/core'
import * as client from '../routine/goalsCoverage'

const SAMPLES = [
  { goals: ['hydrater_profondeur', 'proteger_soleil', 'cheveux_brillants'], otherGoals: 'Avoir une belle dentition' },
  { goals: ['peau_douce'] },
  { goals: [], otherGoals: 'Éclat', otherGoalsFace: 'moins de points noirs', otherGoalsHair: 'boucles définies' },
  { goals: ['reduire_rides', 'inconnu_xyz', 'reduire_rides'], otherGoals: '  ' },
  // simplifier_routine est EXCLU du bloc (17 juil 2026) : client ET core doivent
  // le retirer à l'identique, sinon la fraîcheur (goals_signature) diverge.
  { goals: ['peau_douce', 'simplifier_routine', 'decouvrir_clean'] },
  {},
]

describe('parité client ↔ core', () => {
  it('même version', () => {
    expect(client.GOALS_COVERAGE_VERSION).toBe(core.GOALS_COVERAGE_VERSION)
    expect(client.MAX_CUSTOM_GOALS).toBe(core.MAX_CUSTOM_GOALS)
  })

  it('djb2 / normalizeGoalText / customGoalKey identiques', () => {
    for (const s of ['abc', 'Éclat', 'Avoir une belle dentition', 'BELLE  dentition', '']) {
      expect(client.djb2(s)).toBe(core.djb2(s))
      expect(client.normalizeGoalText(s)).toBe(core.normalizeGoalText(s))
      if (s) expect(client.customGoalKey(s)).toBe(core.customGoalKey(s))
    }
  })

  it('la clé libre correspond à celle observée en prod (free:t97by8)', () => {
    expect(client.customGoalKey('Avoir une belle dentition')).toBe('free:t97by8')
    expect(core.customGoalKey('Avoir une belle dentition')).toBe('free:t97by8')
  })

  it('collectGoals produit le MÊME ensemble de clés', () => {
    for (const s of SAMPLES) {
      const ck = client.collectGoals(s).map((g) => g.key).sort()
      const sk = core.collectGoals(s).map((g) => g.key).sort()
      expect(ck).toEqual(sk)
    }
  })

  it('goalsSignature identique', () => {
    for (const s of SAMPLES) {
      expect(client.goalsSignatureFromSkin(s)).toBe(core.goalsSignature(core.collectGoals(s)))
    }
  })

  it('routineSignature identique', () => {
    const items = [
      { analysis_id: 'b', frequency: 'weekly' },
      { analysis_id: 'a', frequency: 'daily' },
      { analysis_id: '', frequency: 'daily' },
    ]
    expect(client.routineSignatureFromItems(items)).toBe(core.routineSignature(items))
  })

  it('hasAnyGoal cohérent', () => {
    for (const s of SAMPLES) {
      expect(client.hasAnyGoal(s)).toBe(core.hasAnyGoal(s))
    }
  })
})
