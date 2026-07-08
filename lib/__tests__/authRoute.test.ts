/**
 * resolveAuthRoute - decision de routage de l'AuthGuard (zone bug-prone).
 * Verrouille les scenarios qui ont cause des rebonds/boucles d'onboarding.
 */
import { resolveAuthRoute, type AuthRouteInput } from '@/lib/navigation/authRoute'

const base: AuthRouteInput = {
  authLoading: false,
  isAuthenticated: false,
  profileLoading: false,
  onboardingShown: false,
  isProfileComplete: false,
  paywallShown: false,
  preOnbDone: false,
  group: undefined,
}

describe('phases de chargement', () => {
  it('auth en cours -> aucune redirection (splash)', () => {
    expect(resolveAuthRoute({ ...base, authLoading: true })).toBeNull()
  })

  it('authentifié mais profil en cours -> on attend', () => {
    expect(
      resolveAuthRoute({ ...base, isAuthenticated: true, profileLoading: true }),
    ).toBeNull()
  })

  it('non authentifié, flag pré-onboarding en lecture (null) -> on attend', () => {
    expect(resolveAuthRoute({ ...base, preOnbDone: null })).toBeNull()
  })
})

describe('non authentifié', () => {
  it('1er lancement (preOnbDone=false), hors groupe -> carrousel', () => {
    expect(resolveAuthRoute({ ...base, preOnbDone: false })).toBe('preonboarding')
  })

  it('déjà vu le carrousel -> écran de bienvenue', () => {
    expect(resolveAuthRoute({ ...base, preOnbDone: true })).toBe('welcome')
  })

  it('déjà sur (auth) -> on laisse (anti-boucle)', () => {
    expect(resolveAuthRoute({ ...base, preOnbDone: true, group: '(auth)' })).toBeNull()
  })

  it('déjà sur (preonboarding) -> on laisse (anti-boucle pendant que le carrousel route)', () => {
    expect(resolveAuthRoute({ ...base, preOnbDone: false, group: '(preonboarding)' })).toBeNull()
  })
})

describe('authentifié', () => {
  const authed = { ...base, isAuthenticated: true }

  it('nouvel inscrit (rien rempli) hors onboarding -> onboarding', () => {
    expect(resolveAuthRoute({ ...authed, group: '(tabs)' })).toBe('onboarding')
  })

  it('depuis (auth) après login, onboarding requis -> onboarding', () => {
    expect(resolveAuthRoute({ ...authed, group: '(auth)' })).toBe('onboarding')
  })

  it('depuis (auth) après login, profil complet -> paywall', () => {
    expect(
      resolveAuthRoute({ ...authed, group: '(auth)', isProfileComplete: true }),
    ).toBe('paywall')
  })

  it('EN COURS d\'onboarding, 2 sections remplies mais pas terminé -> reste (PAS de rebond home)', () => {
    // onboardingShown=false : on NE doit PAS éjecter même si isProfileComplete.
    expect(
      resolveAuthRoute({
        ...authed,
        group: '(onboarding)',
        isProfileComplete: true,
        onboardingShown: false,
      }),
    ).toBeNull()
  })

  it('onboarding explicitement terminé alors qu\'on y est encore -> paywall', () => {
    expect(
      resolveAuthRoute({ ...authed, group: '(onboarding)', onboardingShown: true }),
    ).toBe('paywall')
  })

  it('utilisateur établi naviguant dans l\'app -> on laisse passer', () => {
    expect(
      resolveAuthRoute({ ...authed, group: '(tabs)', onboardingShown: true }),
    ).toBeNull()
  })
})
