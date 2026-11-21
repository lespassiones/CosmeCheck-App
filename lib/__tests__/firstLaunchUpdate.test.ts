import { firstLaunchStep, type FirstLaunchState } from '@/lib/updates/firstLaunchUpdate'

const base: FirstLaunchState = {
  eligible: true,
  expired: false,
  isUpdatePending: false,
  isStartupProcedureRunning: true,
}

describe('firstLaunchStep', () => {
  it('attend pendant la lecture du drapeau et le téléchargement', () => {
    expect(firstLaunchStep({ ...base, eligible: null })).toBe('wait')
    expect(firstLaunchStep(base)).toBe('wait')
  })

  it("recharge dès que l'OTA est téléchargée", () => {
    expect(firstLaunchStep({ ...base, isUpdatePending: true })).toBe('reload')
  })

  it("lâche l'app sans rien attendre hors premier lancement", () => {
    expect(firstLaunchStep({ ...base, eligible: false, isUpdatePending: true })).toBe('release')
  })

  it('lâche quand la vérification finit sans mise à jour', () => {
    expect(firstLaunchStep({ ...base, isStartupProcedureRunning: false })).toBe('release')
  })

  it('ne recharge jamais après le plafond, même si le téléchargement aboutit', () => {
    expect(firstLaunchStep({ ...base, expired: true })).toBe('release')
    expect(firstLaunchStep({ ...base, expired: true, isUpdatePending: true })).toBe('release')
    expect(firstLaunchStep({ ...base, expired: true, eligible: null })).toBe('release')
  })
})
