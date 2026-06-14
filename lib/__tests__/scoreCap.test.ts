/**
 * scoreCap — plancher de sécurité par couleur. Garantit que l'écran d'analyse ET
 * les recommandations affichent la MÊME note plafonnée (un produit qui révèle de
 * l'orange/rouge ne peut pas rester « Très bien »).
 */
import { applyColorCap, scoreLabelFromScore } from '@/lib/analysis/scoreCap'

describe('applyColorCap', () => {
  it('1 rouge -> plafonne à < 9 (À éviter), peu importe le score initial', () => {
    expect(applyColorCap(19.5, 0, 1)).toBe(8.9)
    expect(applyColorCap(20, 5, 3)).toBe(8.9)
  })

  it('3 orange (sans rouge) -> plafonne à < 9', () => {
    expect(applyColorCap(18, 3, 0)).toBe(8.9)
  })

  it('1 ou 2 orange -> plafonne à < 13 (Bien max)', () => {
    expect(applyColorCap(19, 1, 0)).toBe(12.9)
    expect(applyColorCap(19, 2, 0)).toBe(12.9)
  })

  it('aucun orange/rouge -> score inchangé', () => {
    expect(applyColorCap(17.4, 0, 0)).toBe(17.4)
  })

  it('ne REMONTE jamais un score déjà bas', () => {
    expect(applyColorCap(5, 0, 1)).toBe(5)
    expect(applyColorCap(10, 1, 0)).toBe(10)
  })

  // Régression : un produit affiché « Très bien » qui contient de l'orange/rouge
  // doit basculer son LIBELLÉ une fois plafonné.
  it('le libellé suit bien le score plafonné', () => {
    const capped = applyColorCap(19.5, 0, 1)
    expect(scoreLabelFromScore(capped)).toBe('À éviter')
    const cappedOrange = applyColorCap(19, 1, 0)
    expect(scoreLabelFromScore(cappedOrange)).toBe('Moyen')
  })
})

describe('scoreLabelFromScore', () => {
  it('respecte les seuils 17 / 13 / 9', () => {
    expect(scoreLabelFromScore(17)).toBe('Très bien')
    expect(scoreLabelFromScore(16.99)).toBe('Bien')
    expect(scoreLabelFromScore(13)).toBe('Bien')
    expect(scoreLabelFromScore(12.99)).toBe('Moyen')
    expect(scoreLabelFromScore(9)).toBe('Moyen')
    expect(scoreLabelFromScore(8.99)).toBe('À éviter')
    expect(scoreLabelFromScore(0)).toBe('À éviter')
  })
})
