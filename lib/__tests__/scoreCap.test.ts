/**
 * scoreCap — NEUTRALISÉ (notation par pastille). Le plafond couleur est désormais
 * intégré au score de synthèse (moteur pastille, par position) : `applyColorCap`
 * renvoie le score inchangé. On vérifie qu'aucun plafonnement client ne s'applique
 * plus (sinon double-plafonnement / divergence avec le score du catalogue).
 */
import { applyColorCap, scoreLabelFromScore } from '@/lib/analysis/scoreCap'

describe('applyColorCap (neutralisé)', () => {
  it('renvoie toujours le score inchangé, quels que soient orange/rouge', () => {
    expect(applyColorCap(19.5, 0, 1)).toBe(19.5)
    expect(applyColorCap(20, 5, 3)).toBe(20)
    expect(applyColorCap(18, 3, 0)).toBe(18)
    expect(applyColorCap(19, 1, 0)).toBe(19)
    expect(applyColorCap(17.4, 0, 0)).toBe(17.4)
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
