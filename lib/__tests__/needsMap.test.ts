/**
 * needsMap : cartographie profil beauté -> needs produit des Pépites de la semaine.
 *
 * Ces tests verrouillent trois contrats :
 *   1. INTENT_NEEDS reflète EXACTEMENT les 15 slugs semés par la migration
 *      20260701_create_product_intent_mapping.sql (le client et la DB doivent
 *      parler le même vocabulaire, sinon la RPC batch ne renvoie rien) ;
 *   2. EXHAUSTIVITÉ : chaque valeur de SKIN_CONCERNS, PROFILE_GOALS et
 *      HAIR_CONCERNS possède au moins un mapping pondéré valide (aucun signal
 *      de profil ne doit être silencieusement ignoré) ;
 *   3. pickNeedsForUser est DÉTERMINISTE : même profil + même semaine ISO ->
 *      mêmes needs ; profil vide -> rotation hebdo stable qui change de semaine
 *      en semaine (base du cache React Query 7 jours, 0 IA, 0 crédit).
 */

import {
  CONCERN_NEEDS,
  DEFAULT_ROTATION,
  GOAL_NEEDS,
  HAIR_NEEDS,
  INTENT_NEEDS,
  pickNeedsForUser,
  type IntentNeed,
  type NeedWeight,
} from '@/lib/weeklyPicks/needsMap'
import {
  HAIR_CONCERNS,
  PROFILE_GOALS,
  SKIN_CONCERNS,
  type SkinProfile,
} from '@/lib/skin/profile'

const NEED_SET = new Set<string>(INTENT_NEEDS)

function expectValidEntries(entries: NeedWeight[] | undefined, key: string): void {
  expect(entries).toBeDefined()
  expect(entries!.length).toBeGreaterThanOrEqual(1)
  for (const e of entries!) {
    expect(NEED_SET.has(e.need)).toBe(true)
    expect(e.w).toBeGreaterThan(0)
    if (e.w <= 0) throw new Error(`poids invalide pour ${key}`)
  }
}

describe('INTENT_NEEDS : contrat avec la migration product_intent_mapping', () => {
  it('reproduit exactement les 15 slugs semés (ordre du INSERT)', () => {
    expect([...INTENT_NEEDS]).toEqual([
      'odor_control_feet',
      'hydration_face',
      'anti_aging',
      'sensitivity_face',
      'shampoo_dry_hair',
      'hand_care',
      'acne_prone',
      'sun_protection',
      'lip_care',
      'eye_care',
      'scalp_health',
      'body_hydration',
      'anti_cellulite',
      'brightening',
      'calming_sensitive',
    ])
  })
})

describe('Exhaustivité des mappings profil -> needs', () => {
  it('chaque préoccupation peau (SKIN_CONCERNS) a au moins un mapping valide', () => {
    for (const concern of SKIN_CONCERNS) {
      expectValidEntries(CONCERN_NEEDS[concern], concern)
    }
  })

  it('chaque objectif (PROFILE_GOALS) a au moins un mapping valide', () => {
    for (const goal of PROFILE_GOALS) {
      expectValidEntries(GOAL_NEEDS[goal], goal)
    }
  })

  it('chaque préoccupation cheveux (HAIR_CONCERNS) a au moins un mapping valide', () => {
    for (const hair of HAIR_CONCERNS) {
      expectValidEntries(HAIR_NEEDS[hair], hair)
    }
  })

  it('aucune clé orpheline : les maps ne contiennent que des valeurs canoniques', () => {
    const concerns = new Set<string>(SKIN_CONCERNS)
    const goals = new Set<string>(PROFILE_GOALS)
    const hair = new Set<string>(HAIR_CONCERNS)
    for (const key of Object.keys(CONCERN_NEEDS)) expect(concerns.has(key)).toBe(true)
    for (const key of Object.keys(GOAL_NEEDS)) expect(goals.has(key)).toBe(true)
    for (const key of Object.keys(HAIR_NEEDS)) expect(hair.has(key)).toBe(true)
  })

  it('tous les poids de tous les mappings sont strictement positifs', () => {
    const allMaps = [CONCERN_NEEDS, GOAL_NEEDS, HAIR_NEEDS]
    for (const map of allMaps) {
      for (const entries of Object.values(map)) {
        for (const e of entries) expect(e.w).toBeGreaterThan(0)
      }
    }
  })
})

describe('DEFAULT_ROTATION : rotation grand public', () => {
  it('est un sous-ensemble de INTENT_NEEDS sans doublon', () => {
    for (const need of DEFAULT_ROTATION) expect(NEED_SET.has(need)).toBe(true)
    expect(new Set(DEFAULT_ROTATION).size).toBe(DEFAULT_ROTATION.length)
  })

  it("exclut odor_control_feet (besoin trop spécifique pour une rotation par défaut)", () => {
    expect(DEFAULT_ROTATION).not.toContain('odor_control_feet')
  })
})

describe('pickNeedsForUser : profil vide (fallback rotation hebdo)', () => {
  it('renvoie 3 needs déterministes tirés de DEFAULT_ROTATION', () => {
    const a = pickNeedsForUser({}, '2026-W28')
    const b = pickNeedsForUser({}, '2026-W28')
    expect(a).toEqual(b)
    expect(a).toHaveLength(3)
    for (const need of a) expect(DEFAULT_ROTATION).toContain(need)
  })

  it('change de sélection quand la semaine change', () => {
    const w28 = pickNeedsForUser({}, '2026-W28').join(',')
    const w29 = pickNeedsForUser({}, '2026-W29').join(',')
    expect(w28).not.toBe(w29)
  })

  it('ne renvoie jamais de doublon', () => {
    const picks = pickNeedsForUser({}, '2026-W28', 5)
    expect(new Set(picks).size).toBe(picks.length)
  })
})

describe('pickNeedsForUser : profil avec signaux', () => {
  const acneRides: SkinProfile = { concerns: ['acne', 'rides'] }

  it('profil acné + rides -> acne_prone et anti_aging dans le top 3', () => {
    const picks = pickNeedsForUser(acneRides, '2026-W28')
    expect(picks).toHaveLength(3)
    expect(picks).toContain('acne_prone')
    expect(picks).toContain('anti_aging')
  })

  it("tie-break par l'ordre INTENT_NEEDS : anti_aging (poids 3) devance acne_prone (poids 3)", () => {
    // acne -> acne_prone w3 ; rides -> anti_aging w3 + eye_care w1.
    // Égalité de poids -> ordre du INSERT : anti_aging (index 2) < acne_prone (index 6).
    const picks = pickNeedsForUser(acneRides, '2026-W28')
    expect(picks[0]).toBe('anti_aging')
    expect(picks[1]).toBe('acne_prone')
    expect(picks[2]).toBe('eye_care')
  })

  it('les poids se cumulent entre concerns, goals et cheveux', () => {
    // sensibilite: sensitivity_face 3 + calming_sensitive 2
    // calmer_rougeurs: calming_sensitive 3 -> calming_sensitive total 5 devance tout.
    const profile: SkinProfile = {
      concerns: ['sensibilite'],
      goals: ['calmer_rougeurs'],
    }
    const picks = pickNeedsForUser(profile, '2026-W28')
    expect(picks[0]).toBe('calming_sensitive')
    expect(picks[1]).toBe('sensitivity_face')
  })

  it('respecte count : count=2 tronque, count=5 complète depuis la rotation sans doublon', () => {
    const two = pickNeedsForUser(acneRides, '2026-W28', 2)
    expect(two).toEqual(['anti_aging', 'acne_prone'])

    const five = pickNeedsForUser(acneRides, '2026-W28', 5)
    expect(five).toHaveLength(5)
    expect(new Set(five).size).toBe(5)
    // Les 3 needs du profil restent en tête, le complément vient de la rotation.
    expect(five.slice(0, 3)).toEqual(['anti_aging', 'acne_prone', 'eye_care'])
    for (const extra of five.slice(3)) expect(DEFAULT_ROTATION).toContain(extra)
  })

  it('count=0 renvoie un tableau vide', () => {
    expect(pickNeedsForUser(acneRides, '2026-W28', 0)).toEqual([])
    expect(pickNeedsForUser({}, '2026-W28', 0)).toEqual([])
  })

  it('est déterministe pour un même (profil, semaine)', () => {
    const profile: SkinProfile = {
      concerns: ['secheresse', 'taches'],
      goals: ['proteger_soleil'],
      hairConcerns: ['pellicules'],
    }
    const a = pickNeedsForUser(profile, '2026-W28', 4)
    const b = pickNeedsForUser(profile, '2026-W28', 4)
    expect(a).toEqual(b)
    const all: IntentNeed[] = a
    for (const need of all) expect(NEED_SET.has(need)).toBe(true)
  })

  it('ignore sans crash un concern legacy inconnu du mapping (fallback rotation)', () => {
    // 'anti-age' est normalement réécrit en 'rides' par readSkinProfile ; si un
    // alias legacy arrive quand même ici, il ne doit ni crasher ni peser.
    const legacy = { concerns: ['anti-age'] } as unknown as SkinProfile
    const picks = pickNeedsForUser(legacy, '2026-W28')
    expect(picks).toHaveLength(3)
    for (const need of picks) expect(DEFAULT_ROTATION).toContain(need)
  })
})
