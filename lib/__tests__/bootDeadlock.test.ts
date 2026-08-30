/**
 * L'écran de démarrage peut-il rester bloqué sur son indicateur ?
 *
 * ## Le défaut verrouillé ici
 *
 * Production Android, build 25, constaté le 30/08/2026 : à l'ouverture, l'app
 * passait le splash animé puis restait indéfiniment sur un petit cercle violet
 * centré. Ce cercle n'existe qu'à un seul endroit, le `Loader` de
 * `app/(onboarding)/_layout.tsx`.
 *
 * Le chronomètre désigne la branche. Le splash animé ne se retire sur
 * `ready` qu'une fois l'auth résolue ET le profil chargé, sinon il tient
 * jusqu'à son propre plafond de 6 s. Il est parti à 2,5 s après le montage,
 * soit très exactement la durée de son animation minimale : l'auth et le profil
 * étaient donc tous deux prêts. La seule branche qui rendait encore un
 * indicateur dans cet état était `if (onboardingShown) return <Loader />`, et
 * elle n'avait aucune sortie à elle : elle s'en remettait à l'`AuthGuard`.
 *
 * Or la règle du guard qui l'en sort est conditionnée à
 * `segments[0] === '(onboarding)'`. L'énumération ci-dessous comptait
 * 56 combinaisons terminales où le layout attendait le guard pendant que le
 * guard répondait « rien à faire ». Et le piège était refermé par l'écran
 * lui-même : rendre l'indicateur, c'est renvoyer une `View` au lieu du
 * `<Stack>`, donc supprimer la route enfant qui produit ce segment.
 *
 * ## La règle que ce fichier tient
 *
 * **Un état terminal ne peut pas rendre `loader`.** Terminal veut dire : plus
 * aucune réponse n'est en vol, donc plus rien ne changera de soi-même. Dans un
 * tel état, l'écran DOIT produire une destination. Le reste du temps, un
 * plafond convertit l'attente en destination.
 */
import {
  resolveOnboardingGate,
  type OnboardingGateInput,
} from '@/lib/navigation/onboardingGate'
import { resolveAuthRoute, type AuthRouteInput } from '@/lib/navigation/authRoute'

const BOOLS = [false, true]

/** Toutes les combinaisons de l'entrée, les deux drapeaux de temps mis à part. */
function* combinaisons(
  authLoading: boolean,
  profileLoading: boolean,
  waitedTooLong: boolean,
): Generator<OnboardingGateInput> {
  for (const isAuthenticated of BOOLS)
    for (const profileUnavailable of BOOLS)
      for (const onboardingShown of BOOLS)
        for (const paywallShown of BOOLS)
          yield {
            authLoading,
            isAuthenticated,
            profileLoading,
            profileUnavailable,
            onboardingShown,
            paywallShown,
            waitedTooLong,
          }
}

describe('la porte d\'onboarding ne peut plus rester close', () => {
  it('aucun etat TERMINAL ne rend un indicateur', () => {
    const impasses: string[] = []
    for (const s of combinaisons(false, false, false)) {
      if (resolveOnboardingGate(s) === 'loader') impasses.push(JSON.stringify(s))
    }
    expect(impasses).toEqual([])
  })

  it('le plafond d\'attente convertit toute attente en destination', () => {
    // C'est le filet de dernier recours : meme si les deux sources restaient en
    // vol pour une raison qu'on n'a pas prevue, l'ecran finit par trancher.
    for (const authLoading of BOOLS)
      for (const profileLoading of BOOLS)
        for (const s of combinaisons(authLoading, profileLoading, true)) {
          expect(resolveOnboardingGate(s)).not.toBe('loader')
        }
  })

  it('l\'etat exact du 30/08/2026 produit une destination', () => {
    // Connecte, profil lu, onboarding deja termine : c'etait le cercle violet.
    const base = {
      authLoading: false,
      isAuthenticated: true,
      profileLoading: false,
      profileUnavailable: false,
      onboardingShown: true,
      waitedTooLong: false,
    }
    expect(resolveOnboardingGate({ ...base, paywallShown: true })).toBe('home')
    expect(resolveOnboardingGate({ ...base, paywallShown: false })).toBe('paywall')
  })

  it('l\'attente reste permise tant qu\'une reponse est reellement en vol', () => {
    // Ne pas confondre « ne jamais attendre » et « ne jamais rester bloque ».
    expect(
      resolveOnboardingGate({
        authLoading: true,
        isAuthenticated: false,
        profileLoading: false,
        profileUnavailable: false,
        onboardingShown: false,
        paywallShown: false,
        waitedTooLong: false,
      }),
    ).toBe('loader')
  })

  it('personne non connectee : la vitrine, jamais un indicateur', () => {
    for (const s of combinaisons(false, false, false)) {
      if (!s.isAuthenticated) expect(resolveOnboardingGate(s)).toBe('preonboarding')
    }
  })
})

describe('profil illisible : on n\'en deduit rien', () => {
  it('la porte ouvre l\'app au lieu de refaire faire l\'onboarding', () => {
    // Un reseau muet ne doit pas renvoyer au questionnaire quelqu'un qui l'a
    // termine il y a des mois. `onboardingShown` vaut faux par defaut quand la
    // ligne n'a pas pu etre lue : c'est une absence, pas une reponse.
    expect(
      resolveOnboardingGate({
        authLoading: false,
        isAuthenticated: true,
        profileLoading: false,
        profileUnavailable: true,
        onboardingShown: false,
        paywallShown: false,
        waitedTooLong: false,
      }),
    ).toBe('home')
  })

  it('le garde applique la meme regle, et ne reste jamais muet', () => {
    const base: AuthRouteInput = {
      authLoading: false,
      signInPending: false,
      isAuthenticated: true,
      profileLoading: false,
      profileUnavailable: true,
      onboardingShown: false,
      isProfileComplete: false,
      paywallShown: false,
      consentGiven: false,
      preOnbSeen: false,
      group: undefined,
    }
    expect(resolveAuthRoute(base)).toBe('home')
    expect(resolveAuthRoute({ ...base, group: '(onboarding)' })).toBe('home')
    expect(resolveAuthRoute({ ...base, group: 'consent' })).toBe('home')
    // Deja sur une page ordinaire : on ne la lui reprend pas.
    expect(resolveAuthRoute({ ...base, group: '(tabs)' })).toBeNull()
    expect(resolveAuthRoute({ ...base, group: 'offre' })).toBeNull()
    expect(resolveAuthRoute({ ...base, group: 'premium' })).toBeNull()
  })
})
