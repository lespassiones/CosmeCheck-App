/**
 * Retour au toucher des boutons (lib/pressFeedback.ts) : dosage haptique par
 * utilité de l'action, et règle d'ajout de la mini-transition.
 */
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(() => Promise.resolve()),
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy', Soft: 'soft', Rigid: 'rigid' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}))

import * as Haptics from 'expo-haptics'
import { fireHaptic, shouldAnimatePress, DEFAULT_PRESS_SCALE } from '@/lib/pressFeedback'

const h = Haptics as unknown as {
  selectionAsync: jest.Mock
  impactAsync: jest.Mock
  notificationAsync: jest.Mock
}

beforeEach(() => {
  h.selectionAsync.mockClear()
  h.impactAsync.mockClear()
  h.notificationAsync.mockClear()
})

describe('fireHaptic : intensité selon l’utilité de l’action', () => {
  it('action phare : impact moyen', () => {
    fireHaptic('primary')
    expect(h.impactAsync).toHaveBeenCalledWith('medium')
  })
  it('action courante (défaut des boutons) : impact léger', () => {
    fireHaptic('secondary')
    expect(h.impactAsync).toHaveBeenCalledWith('light')
  })
  it('choix dans un ensemble : clic de sélection, le plus discret', () => {
    fireHaptic('selection')
    expect(h.selectionAsync).toHaveBeenCalledTimes(1)
    expect(h.impactAsync).not.toHaveBeenCalled()
  })
  it('issue positive et action risquée : notifications système', () => {
    fireHaptic('success')
    fireHaptic('warning')
    expect(h.notificationAsync).toHaveBeenNthCalledWith(1, 'success')
    expect(h.notificationAsync).toHaveBeenNthCalledWith(2, 'warning')
  })
  it('none : aucune vibration', () => {
    fireHaptic('none')
    expect(h.selectionAsync).not.toHaveBeenCalled()
    expect(h.impactAsync).not.toHaveBeenCalled()
    expect(h.notificationAsync).not.toHaveBeenCalled()
  })
  it('un moteur absent ne fait jamais planter un bouton', async () => {
    h.impactAsync.mockImplementationOnce(() => Promise.reject(new Error('pas de moteur')))
    expect(() => fireHaptic('primary')).not.toThrow()
    await Promise.resolve()
  })
})

describe('shouldAnimatePress : mini-transition seulement si le bouton n’a pas déjà son effet', () => {
  it('style simple : on ajoute le léger rétrécissement', () => {
    expect(shouldAnimatePress({ actionable: true, styleIsFunction: false, childrenIsFunction: false, pressScale: undefined })).toBe(true)
  })
  it('style en fonction de pressed : l’écran gère déjà son effet', () => {
    expect(shouldAnimatePress({ actionable: true, styleIsFunction: true, childrenIsFunction: false, pressScale: undefined })).toBe(false)
  })
  it('enfants en fonction de pressed : idem', () => {
    expect(shouldAnimatePress({ actionable: true, styleIsFunction: false, childrenIsFunction: true, pressScale: undefined })).toBe(false)
  })
  it('pressScale={false} (fond de modale) : aucune transition', () => {
    expect(shouldAnimatePress({ actionable: true, styleIsFunction: false, childrenIsFunction: false, pressScale: false })).toBe(false)
  })
  it('élément sans action (bloque juste la propagation) : aucune transition', () => {
    expect(shouldAnimatePress({ actionable: false, styleIsFunction: false, childrenIsFunction: false, pressScale: undefined })).toBe(false)
  })
  it('échelle par défaut perceptible mais discrète', () => {
    expect(DEFAULT_PRESS_SCALE).toBeGreaterThan(0.9)
    expect(DEFAULT_PRESS_SCALE).toBeLessThan(1)
  })
})
