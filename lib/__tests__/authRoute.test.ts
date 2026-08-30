/**
 * resolveAuthRoute - decision de routage de l'AuthGuard (zone bug-prone).
 * Verrouille les scenarios qui ont cause des rebonds/boucles d'onboarding.
 */
import { resolveAuthRoute, type AuthRouteInput } from '@/lib/navigation/authRoute'

const base: AuthRouteInput = {
  authLoading: false,
  signInPending: false,
  isAuthenticated: false,
  profileLoading: false,
  profileUnavailable: false,
  onboardingShown: false,
  isProfileComplete: false,
  paywallShown: false,
  consentGiven: false,
  preOnbSeen: false,
  group: undefined,
}

describe('phases de chargement', () => {
  it('auth en cours -> aucune redirection (splash)', () => {
    expect(resolveAuthRoute({ ...base, authLoading: true })).toBeNull()
  })

  it('connexion en cours de finalisation -> on ne decide RIEN', () => {
    // Signale le 28/08/2026 : a la connexion du compte de demonstration Apple,
    // l'accueil clignotait avant l'ecran de consentement. `signInWithPassword`
    // ouvre la session avant que `signIn` n'ait fini, donc le guard routait sur
    // un profil encore perime, puis se corrigeait. Il doit s'abstenir.
    expect(
      resolveAuthRoute({
        ...base,
        signInPending: true,
        isAuthenticated: true,
        onboardingShown: true,
        isProfileComplete: true,
        paywallShown: true,
        consentGiven: true,
        group: '(auth)',
      }),
    ).toBeNull()
  })

  it('ce garde-fou prime sur tout le reste', () => {
    // Y compris sur les branches « pas de session », pour qu'aucun etat
    // transitoire ne puisse produire une destination.
    expect(resolveAuthRoute({ ...base, signInPending: true })).toBeNull()
    expect(
      resolveAuthRoute({ ...base, signInPending: true, group: '(tabs)' }),
    ).toBeNull()
  })

  it('authentifié mais profil en cours -> on attend', () => {
    expect(
      resolveAuthRoute({ ...base, isAuthenticated: true, profileLoading: true }),
    ).toBeNull()
  })
})

describe('non authentifié : le carrousel est le seul point d\'entrée', () => {
  it('1er lancement, hors groupe -> carrousel', () => {
    expect(resolveAuthRoute(base)).toBe('preonboarding')
  })

  it('REGRESSION : posé sur un écran d\'auth sans avoir vu le carrousel -> carrousel', () => {
    // Le bug d'origine : `app/` n'ayant pas de route racine, expo-router servait
    // le groupe (onboarding) sur `/`, dont le layout redirigeait vers welcome.
    // Le guard voyait alors (auth) et s'abstenait, verrouillant l'app sur
    // l'ecran de connexion. Desormais il ramene au carrousel.
    expect(resolveAuthRoute({ ...base, group: '(auth)' })).toBe('preonboarding')
  })

  it('sur un écran d\'auth APRÈS avoir traversé le carrousel -> on laisse', () => {
    expect(
      resolveAuthRoute({ ...base, group: '(auth)', preOnbSeen: true }),
    ).toBeNull()
  })

  it('déjà sur le carrousel -> on laisse (anti-boucle)', () => {
    expect(resolveAuthRoute({ ...base, group: '(preonboarding)' })).toBeNull()
  })

  it('carrousel deja traverse, mais posé ailleurs (deep link, tabs) -> bienvenue', () => {
    expect(
      resolveAuthRoute({ ...base, group: '(tabs)', preOnbSeen: true }),
    ).toBe('welcome')
  })

  it('REGRESSION : deconnexion depuis les tabs -> carrousel, pas connexion', () => {
    // `signOut` rearme le flag, donc preOnbSeen repasse a false.
    expect(resolveAuthRoute({ ...base, group: '(tabs)' })).toBe('preonboarding')
  })

  it('etat des flags de profil sans session -> sans effet', () => {
    // Un profil en cache d'un compte precedent ne doit pas ouvrir l'app.
    expect(
      resolveAuthRoute({
        ...base,
        onboardingShown: true,
        isProfileComplete: true,
        paywallShown: true,
        consentGiven: true,
      }),
    ).toBe('preonboarding')
  })
})

describe('consentement (avant le questionnaire)', () => {
  const authed = { ...base, isAuthenticated: true }

  it('nouvel inscrit sans consentement -> ecran de consentement', () => {
    expect(resolveAuthRoute({ ...authed, group: '(tabs)' })).toBe('consent')
  })

  it('depuis (auth) apres inscription -> consentement AVANT onboarding', () => {
    expect(resolveAuthRoute({ ...authed, group: '(auth)' })).toBe('consent')
  })

  it('deja sur l\'ecran de consentement -> on laisse (anti-boucle)', () => {
    expect(resolveAuthRoute({ ...authed, group: 'consent' })).toBeNull()
  })

  it('consentement donne -> on enchaine sur le questionnaire', () => {
    expect(
      resolveAuthRoute({ ...authed, group: 'consent', consentGiven: true }),
    ).toBe('onboarding')
  })

  it('compte deja onboarde AVANT l\'existence de cet ecran -> jamais re-sollicite', () => {
    // needsOnboarding est faux pour eux : pas de consentement retroactif impose.
    expect(
      resolveAuthRoute({
        ...authed,
        group: '(tabs)',
        onboardingShown: true,
        isProfileComplete: true,
        paywallShown: true,
        consentGiven: false,
      }),
    ).toBeNull()
  })

  it('compte deja onboarde qui atterrit sur /consent -> il en ressort', () => {
    expect(
      resolveAuthRoute({
        ...authed,
        group: 'consent',
        onboardingShown: true,
        isProfileComplete: true,
        paywallShown: true,
        consentGiven: true,
      }),
    ).toBe('home')
  })
})

describe('authentifié', () => {
  const authed = { ...base, isAuthenticated: true, consentGiven: true }

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

  it('sur /offre en tant que paywall post-onboarding -> pas de rebouclage', () => {
    expect(
      resolveAuthRoute({
        ...authed,
        group: 'offre',
        onboardingShown: true,
        isProfileComplete: true,
        paywallShown: false,
      }),
    ).toBeNull()
  })
})
