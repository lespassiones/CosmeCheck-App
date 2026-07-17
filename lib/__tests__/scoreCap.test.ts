/**
 * scoreCap — filet d'affichage par INVARIANTS pastille (réactivé 16 juil 2026,
 * incident « feuille verte avec 2 rouges »). Contrairement à l'ancien cap
 * (neutralisé à raison : ≥1 rouge → 8,9 sur-pénalisait un rouge en queue), on
 * n'applique QUE des bornes que le moteur pastille ne peut JAMAIS dépasser :
 *   ≥1 rouge → ≤ 12,9 ; ≥2 rouges ou ≥4 oranges → ≤ 8,9.
 * Un produit sain (note déjà conforme) n'est JAMAIS modifié.
 */
import { applyColorCap, scoreLabelFromScore } from '@/lib/analysis/scoreCap'

describe('applyColorCap (invariants pastille)', () => {
  it("note corrompue « verte » avec rouge(s) → rabattue (l'incident réel : 13,56 avec 2 rouges)", () => {
    expect(applyColorCap(13.56, 2, 2)).toBe(8.9) // le cas Lady Speed Stick
    expect(applyColorCap(19.5, 0, 1)).toBe(12.9) // 1 rouge : jamais vert
    expect(applyColorCap(20, 5, 3)).toBe(8.9) // 3 rouges + 5 oranges
    expect(applyColorCap(17, 4, 0)).toBe(8.9) // ≥4 oranges : warning max
  })

  it('produit SAIN : jamais modifié (pas de sur-pénalisation)', () => {
    expect(applyColorCap(12.5, 0, 1)).toBe(12.5) // rouge en queue, note conforme
    expect(applyColorCap(8.2, 2, 2)).toBe(8.2)
    expect(applyColorCap(17.4, 0, 0)).toBe(17.4) // tout vert
    expect(applyColorCap(15, 2, 0)).toBe(15) // 1-3 oranges peuvent rester verts (queue)
    expect(applyColorCap(5, 0, 1)).toBe(5)
  })
})

describe('scoreLabelFromScore', () => {
  it('respecte les seuils 17 / 13 / 9', () => {
    expect(scoreLabelFromScore(17)).toBe('Très bien')
    expect(scoreLabelFromScore(16.99)).toBe('Bien')
    expect(scoreLabelFromScore(13)).toBe('Bien')
    expect(scoreLabelFromScore(12.99)).toBe('Moyen')
    expect(scoreLabelFromScore(9)).toBe('Moyen')
    expect(scoreLabelFromScore(8.99)).toBe('Faible')
    expect(scoreLabelFromScore(0)).toBe('Faible')
  })
})
