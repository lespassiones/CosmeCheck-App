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
import {
  fireHaptic,
  isGuardedRepeatPress,
  repeatGuardLevel,
  shouldAnimatePress,
  DEFAULT_PRESS_SCALE,
  REPEAT_PRESS_GUARD_MS,
} from '@/lib/pressFeedback'

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

describe('isGuardedRepeatPress (anti double appui)', () => {
  it("ignore un 2e appui rapproché sur un bouton d'action", () => {
    expect(isGuardedRepeatPress('secondary', 1000, 1000 + REPEAT_PRESS_GUARD_MS - 1)).toBe(true)
    expect(isGuardedRepeatPress('primary', 1000, 1200)).toBe(true)
    expect(isGuardedRepeatPress('warning', 1000, 1100)).toBe(true)
  })

  it('laisse passer un appui espacé, et le tout premier', () => {
    expect(isGuardedRepeatPress('secondary', 1000, 1000 + REPEAT_PRESS_GUARD_MS)).toBe(false)
    expect(isGuardedRepeatPress('primary', 0, Date.now())).toBe(false)
  })

  it('ne freine jamais les choix rapides ni les zones passives', () => {
    expect(isGuardedRepeatPress('selection', 1000, 1010)).toBe(false)
    expect(isGuardedRepeatPress('none', 1000, 1010)).toBe(false)
  })
})

describe('repeatGuardLevel (choix rapides par rôle)', () => {
  it('case, radio, interrupteur, onglet : jamais freinés', () => {
    for (const role of ['checkbox', 'radio', 'switch', 'tab']) {
      expect(repeatGuardLevel('none', role)).toBe('selection')
      expect(repeatGuardLevel('secondary', role)).toBe('selection')
    }
  })

  it('bouton ordinaire : garde son niveau', () => {
    expect(repeatGuardLevel('secondary', 'button')).toBe('secondary')
    expect(repeatGuardLevel('primary', undefined)).toBe('primary')
  })
})
