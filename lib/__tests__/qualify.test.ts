import { qualifiesForSuggestion, suggestionSeverity } from '@/lib/routine/qualify'

const C = (vert: number, jaune: number, orange: number, rouge: number) => ({
  vert,
  jaune,
  orange,
  rouge,
})

describe('qualifiesForSuggestion — règle de sélection', () => {
  // ── 1. Orange / rouge → toujours (obligatoire) ────────────────────────────
  it('orange seul → true', () => {
    expect(qualifiesForSuggestion(C(10, 0, 1, 0))).toBe(true)
  })
  it('rouge seul → true', () => {
    expect(qualifiesForSuggestion(C(10, 0, 0, 1))).toBe(true)
  })
  it('orange + rouge → true', () => {
    expect(qualifiesForSuggestion(C(3, 2, 2, 1))).toBe(true)
  })
  it('orange même quand vert domine largement → true', () => {
    expect(qualifiesForSuggestion(C(20, 0, 1, 0))).toBe(true)
  })
  it('rouge même quand vert domine largement → true', () => {
    expect(qualifiesForSuggestion(C(50, 3, 0, 1))).toBe(true)
  })

  // ── 2. Restriction → toujours (même produit vert) ─────────────────────────
  it('produit tout vert MAIS ingrédient restreint → true', () => {
    expect(qualifiesForSuggestion(C(12, 0, 0, 0), 1)).toBe(true)
  })
  it('vert > jaune mais restreint → true', () => {
    expect(qualifiesForSuggestion(C(8, 2, 0, 0), 2)).toBe(true)
  })
  it('restrictedCount 0 explicite, tout vert → false', () => {
    expect(qualifiesForSuggestion(C(8, 2, 0, 0), 0)).toBe(false)
  })

  // ── 3. Vert/jaune uniquement : jaune > vert ? ─────────────────────────────
  it('jaune > vert → true', () => {
    expect(qualifiesForSuggestion(C(2, 5, 0, 0))).toBe(true)
  })
  it('jaune seul (vert 0) → true', () => {
    expect(qualifiesForSuggestion(C(0, 3, 0, 0))).toBe(true)
  })
  it('vert > jaune → false', () => {
    expect(qualifiesForSuggestion(C(6, 2, 0, 0))).toBe(false)
  })
  it('vert seul → false', () => {
    expect(qualifiesForSuggestion(C(9, 0, 0, 0))).toBe(false)
  })
  it('vert == jaune (égalité) → false (vert ≥ jaune = bon)', () => {
    expect(qualifiesForSuggestion(C(4, 4, 0, 0))).toBe(false)
  })
  it('tout à zéro → false', () => {
    expect(qualifiesForSuggestion(C(0, 0, 0, 0))).toBe(false)
  })
  it('jaune = vert + 1 → true', () => {
    expect(qualifiesForSuggestion(C(5, 6, 0, 0))).toBe(true)
  })

  // ── Robustesse (champs manquants / restrictedCount défaut) ────────────────
  it('restrictedCount par défaut (non fourni), vert domine → false', () => {
    expect(qualifiesForSuggestion(C(5, 1, 0, 0))).toBe(false)
  })
  it('counts partiels (undefined traités comme 0) : orange défini → true', () => {
    expect(qualifiesForSuggestion({ vert: 3, jaune: 0, orange: 2, rouge: 0 })).toBe(true)
  })
  it('counts partiels : uniquement jaune renseigné → true (jaune>vert)', () => {
    expect(qualifiesForSuggestion({ vert: 0, jaune: 1, orange: 0, rouge: 0 })).toBe(true)
  })

  // ── Cas « type produit » évoqués par l'utilisateur ────────────────────────
  it('produit dangereux (rouge dominant) → true', () => {
    expect(qualifiesForSuggestion(C(1, 1, 3, 4), 0)).toBe(true)
  })
  it('bon produit (vert dominant, un peu de jaune) → false', () => {
    expect(qualifiesForSuggestion(C(15, 3, 0, 0), 0)).toBe(false)
  })
  it('produit « jaune domine » sans orange/rouge → true', () => {
    expect(qualifiesForSuggestion(C(3, 8, 0, 0), 0)).toBe(true)
  })
})

describe('suggestionSeverity — ordre de priorité', () => {
  it('restreint passe avant tout', () => {
    const restr = suggestionSeverity(C(0, 0, 0, 0), 1, 20)
    const rouge = suggestionSeverity(C(0, 0, 0, 5), 0, 0)
    expect(restr).toBeGreaterThan(rouge)
  })
  it('rouge pèse plus que orange', () => {
    const rouge = suggestionSeverity(C(0, 0, 0, 1), 0, 20)
    const orange = suggestionSeverity(C(0, 0, 1, 0), 0, 20)
    expect(rouge).toBeGreaterThan(orange)
  })
  it('score plus bas → sévérité plus haute (à couleurs égales)', () => {
    const bas = suggestionSeverity(C(0, 0, 1, 0), 0, 4)
    const haut = suggestionSeverity(C(0, 0, 1, 0), 0, 12)
    expect(bas).toBeGreaterThan(haut)
  })
})
