/**
 * Tests de la feuille PURE `routine-conflicts-ai/lib/normalize.ts`.
 *
 * QUOI : validation/caps de la requête, graine de cache stable à permutation
 * près, parse défensif de la sortie modèle (coercition de sévérité, cap,
 * nettoyage U+2014 et mentions de score /20).
 *
 * POURQUOI : cette feuille sécurise le contrat Edge (aucun crash sur payload
 * douteux) et l'éditorial (aucun tiret cadratin, aucun score produit) ; elle
 * est importée en RELATIF (pattern coherenceAbsenceGuard) car sans dépendance.
 */
import {
  MAX_AI_CONFLICTS,
  MAX_PRODUCTS,
  MAX_SIGNALS,
  buildCacheSeed,
  parseAiConflicts,
  validateDeepCheckRequest,
} from '../../supabase/functions/routine-conflicts-ai/lib/normalize'

const EM_DASH = String.fromCharCode(0x2014)

describe('validateDeepCheckRequest', () => {
  it('body non-objet => null', () => {
    expect(validateDeepCheckRequest(null)).toBeNull()
    expect(validateDeepCheckRequest('x')).toBeNull()
    expect(validateDeepCheckRequest(42)).toBeNull()
    expect(validateDeepCheckRequest({})).toBeNull() // products manquant
  })

  it('payload valide normalisé', () => {
    const req = validateDeepCheckRequest({
      products: [
        { name: 'Sérum', category: 'creme_visage', timeOfDay: 'evening', frequency: 'daily', signals: ['retinol'] },
      ],
      profileSummary: 'Peau sensible',
      deterministicFindings: [{ ruleId: 'r1', title: 'A + B' }],
    })
    expect(req).not.toBeNull()
    expect(req!.products).toHaveLength(1)
    expect(req!.products[0]).toMatchObject({ name: 'Sérum', timeOfDay: 'evening', frequency: 'daily' })
    expect(req!.profileSummary).toBe('Peau sensible')
    expect(req!.deterministicFindings[0].ruleId).toBe('r1')
  })

  it('cap 16 produits -> 15, 20 signaux -> 12', () => {
    const products = Array.from({ length: 16 }, (_, i) => ({
      name: `P${i}`,
      signals: Array.from({ length: 20 }, (_, j) => `s${j}`),
    }))
    const req = validateDeepCheckRequest({ products })
    expect(req!.products).toHaveLength(MAX_PRODUCTS)
    expect(req!.products[0].signals).toHaveLength(MAX_SIGNALS)
  })

  it('coerce timeOfDay inconnu -> null, frequency inconnue -> daily, ignore produit sans nom', () => {
    const req = validateDeepCheckRequest({
      products: [
        { name: 'Ok', timeOfDay: 'wut', frequency: 'yearly', signals: [] },
        { category: 'x' }, // pas de nom => ignoré
      ],
    })
    expect(req!.products).toHaveLength(1)
    expect(req!.products[0].timeOfDay).toBeNull()
    expect(req!.products[0].frequency).toBe('daily')
  })
})

describe('buildCacheSeed', () => {
  it('stable à permutation des produits et des signaux', () => {
    const a = validateDeepCheckRequest({
      products: [
        { name: 'B', signals: ['s2', 's1'] },
        { name: 'A', signals: ['x'] },
      ],
      deterministicFindings: [{ ruleId: 'r2', title: 'T2' }, { ruleId: 'r1', title: 'T1' }],
    })!
    const b = validateDeepCheckRequest({
      products: [
        { name: 'A', signals: ['x'] },
        { name: 'B', signals: ['s1', 's2'] },
      ],
      deterministicFindings: [{ ruleId: 'r1', title: 'T1' }, { ruleId: 'r2', title: 'T2' }],
    })!
    expect(buildCacheSeed(a)).toBe(buildCacheSeed(b))
  })

  it('change si un signal change', () => {
    const a = validateDeepCheckRequest({ products: [{ name: 'A', signals: ['x'] }] })!
    const b = validateDeepCheckRequest({ products: [{ name: 'A', signals: ['y'] }] })!
    expect(buildCacheSeed(a)).not.toBe(buildCacheSeed(b))
  })
})

describe('parseAiConflicts', () => {
  it('JSON valide => normalisé', () => {
    const raw = JSON.stringify({
      additional_conflicts: [
        { title: 'Duo', explanation: 'Explication.', tip: 'Conseil.', severity: 'medium', products: ['A'] },
      ],
      overall_note: 'Note globale.',
    })
    const out = parseAiConflicts(raw)
    expect(out.additional_conflicts).toHaveLength(1)
    expect(out.additional_conflicts[0].severity).toBe('medium')
    expect(out.overall_note).toBe('Note globale.')
  })

  it('sévérité high ou inconnue => coercée info', () => {
    const raw = JSON.stringify({
      additional_conflicts: [
        { title: 'A', explanation: 'x', tip: 't', severity: 'high', products: [] },
        { title: 'B', explanation: 'y', tip: 't', severity: 'bogus', products: [] },
      ],
      overall_note: null,
    })
    const out = parseAiConflicts(raw)
    expect(out.additional_conflicts.map((c) => c.severity)).toEqual(['info', 'info'])
  })

  it('> 5 conflits tronqués à MAX_AI_CONFLICTS', () => {
    const raw = JSON.stringify({
      additional_conflicts: Array.from({ length: 8 }, (_, i) => ({
        title: `T${i}`,
        explanation: 'e',
        tip: 't',
        severity: 'info',
        products: [],
      })),
      overall_note: null,
    })
    expect(parseAiConflicts(raw).additional_conflicts).toHaveLength(MAX_AI_CONFLICTS)
  })

  it('remplace le tiret cadratin U+2014', () => {
    const raw = JSON.stringify({
      additional_conflicts: [
        { title: `Alpha${EM_DASH}Beta`, explanation: 'ok', tip: 't', severity: 'info', products: [] },
      ],
      overall_note: null,
    })
    const out = parseAiConflicts(raw)
    expect(out.additional_conflicts[0].title).not.toContain(EM_DASH)
    expect(out.additional_conflicts[0].title).toContain(',')
  })

  it('JSON invalide => structure vide', () => {
    expect(parseAiConflicts('not json')).toEqual({ additional_conflicts: [], overall_note: null })
  })

  it('phrase contenant un score /20 nettoyée', () => {
    const raw = JSON.stringify({
      additional_conflicts: [
        {
          title: 'Titre propre',
          explanation: 'Ce produit est correct. Il obtient 14/20 selon nous. Continue ainsi.',
          tip: 't',
          severity: 'info',
          products: [],
        },
      ],
      overall_note: null,
    })
    const out = parseAiConflicts(raw)
    expect(out.additional_conflicts[0].explanation).not.toMatch(/14\s*\/\s*20/)
    expect(out.additional_conflicts[0].explanation).toContain('Continue ainsi.')
  })
})
