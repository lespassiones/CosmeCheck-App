/**
 * Parcours complets de l'AuthGuard, de bout en bout.
 *
 * `authRoute.test.ts` verifie des decisions isolees. Ici on fait tourner la
 * BOUCLE : on applique la redirection, on redemande une decision, et ainsi de
 * suite jusqu'a stabilisation. C'est la seule facon d'attraper la classe de bug
 * qui a coute le plus cher sur cet ecran, les allers-retours entre deux ecrans
 * qui se renvoient la balle indefiniment.
 *
 * Chaque scenario verifie deux choses : ou l'on atterrit, et en combien
 * d'etapes. Un parcours qui converge au bout de dix redirections « marche »
 * mais fait clignoter l'app.
 */
import {
  resolveAuthRoute,
  type AuthRouteInput,
  type AuthRouteTarget,
} from '@/lib/navigation/authRoute'

/** Le groupe (`segments[0]`) ou chaque cible fait atterrir. */
const GROUP_OF: Record<Exclude<AuthRouteTarget, null>, string> = {
  welcome: '(auth)',
  preonboarding: '(preonboarding)',
  consent: 'consent',
  onboarding: '(onboarding)',
  // Le paywall est rendu par la page /offre, pas par un groupe dedie.
  paywall: 'offre',
  home: '(tabs)',
}

const MAX_STEPS = 8

interface JourneyResult {
  /** Groupe final, une fois qu'aucune redirection n'est demandee. */
  group: string | undefined
  /** Redirections traversees, dans l'ordre. */
  path: AuthRouteTarget[]
}

/**
 * Fait tourner le guard jusqu'a ce qu'il ne demande plus rien. Echoue fort si
 * ca boucle : un parcours qui ne converge pas est un ecran qui clignote.
 */
function run(input: AuthRouteInput): JourneyResult {
  const path: AuthRouteTarget[] = []
  let group = input.group

  for (let i = 0; i < MAX_STEPS; i += 1) {
    const target = resolveAuthRoute({ ...input, group })
    if (target === null) return { group, path }
    path.push(target)
    group = GROUP_OF[target]
  }

  throw new Error(
    `Boucle de redirection : ${path.join(' -> ')} (depart: ${String(input.group)})`,
  )
}

/** Visiteur : aucune session, rien de traverse. */
const visiteur: AuthRouteInput = {
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

/** Compte tout neuf, juste apres l'inscription. */
const nouveau: AuthRouteInput = {
  ...visiteur,
  isAuthenticated: true,
  preOnbSeen: true,
}

/** Compte etabli, tout est fait. */
const etabli: AuthRouteInput = {
  ...nouveau,
  onboardingShown: true,
  isProfileComplete: true,
  paywallShown: true,
  consentGiven: true,
}

describe('parcours : premiere installation', () => {
  // Les quatre groupes qui pouvaient etre servis sur `/` faute de route racine.
  // Quel que soit celui sur lequel expo-router pose l'app, on doit finir sur le
  // carrousel : c'est ce qui n'etait pas vrai et ouvrait sur la connexion.
  it.each(['(onboarding)', '(tabs)', '(preonboarding)', undefined])(
    'depart sur %s -> carrousel',
    (group) => {
      const { group: fin } = run({ ...visiteur, group })
      expect(fin).toBe('(preonboarding)')
    },
  )

  it('REGRESSION : pose sur l\'ecran de connexion -> ramene au carrousel', () => {
    const { group, path } = run({ ...visiteur, group: '(auth)' })
    expect(group).toBe('(preonboarding)')
    expect(path).toEqual(['preonboarding'])
  })

  it('converge en une seule redirection, sans va-et-vient', () => {
    const { path } = run({ ...visiteur, group: '(onboarding)' })
    expect(path).toHaveLength(1)
  })
})

describe('parcours : du carrousel au compte cree', () => {
  it('carrousel traverse -> on reste sur l\'ecran d\'auth', () => {
    // Ce que fait le carrousel : marque le flag, puis va sur welcome.
    const { group, path } = run({
      ...visiteur,
      preOnbSeen: true,
      group: '(auth)',
    })
    expect(group).toBe('(auth)')
    expect(path).toEqual([])
  })

  it('inscription terminee -> consentement, PUIS questionnaire', () => {
    // Depuis (auth), un compte neuf doit passer par le consentement avant
    // qu'on lui demande quoi que ce soit sur sa peau.
    const { group, path } = run({ ...nouveau, group: '(auth)' })
    expect(path[0]).toBe('consent')
    expect(group).toBe('consent')
  })

  it('consentement donne -> questionnaire', () => {
    const { group, path } = run({
      ...nouveau,
      consentGiven: true,
      group: 'consent',
    })
    expect(path).toEqual(['onboarding'])
    expect(group).toBe('(onboarding)')
  })

  it('questionnaire termine -> paywall', () => {
    const { group } = run({
      ...nouveau,
      consentGiven: true,
      onboardingShown: true,
      isProfileComplete: true,
      group: '(onboarding)',
    })
    expect(group).toBe('offre')
  })

  it("paywall deja vu : le guard n'ejecte PAS de /offre", () => {
    // /offre est aussi une page ordinaire (menu, profil, gestion de
    // l'abonnement). C'est l'ecran qui navigue de lui-meme vers l'accueil au
    // « Plus tard » et vers la bienvenue Premium apres un achat ; si le guard
    // en ejectait, la page d'offre deviendrait inconsultable une fois vue.
    const { group, path } = run({ ...etabli, group: 'offre' })
    expect(path).toEqual([])
    expect(group).toBe('offre')
  })

  it('le parcours complet ne repasse jamais par le consentement', () => {
    const { path } = run({ ...etabli, group: '(auth)' })
    expect(path).not.toContain('consent')
  })
})

describe('parcours : achat', () => {
  it('ecran de bienvenue Premium : pas de renvoi au paywall', () => {
    // Le webhook n'a pas encore repasse `paywall_shown` a vrai cote serveur.
    // Sans exception explicite, le guard renverrait sur le paywall qu'on vient
    // d'acheter.
    const { group, path } = run({
      ...etabli,
      paywallShown: false,
      group: 'premium',
    })
    expect(path).toEqual([])
    expect(group).toBe('premium')
  })
})

describe('parcours : deconnexion', () => {
  it('deconnexion depuis les tabs -> carrousel, jamais la connexion', () => {
    // `signOut` rearme le carrousel, donc preOnbSeen retombe a faux.
    const { group } = run({ ...visiteur, group: '(tabs)' })
    expect(group).toBe('(preonboarding)')
  })

  it('reouverture de l\'app apres deconnexion -> carrousel', () => {
    // Nouveau lancement : le flag memoire repart a faux tout seul.
    const { group } = run({ ...visiteur, group: undefined })
    expect(group).toBe('(preonboarding)')
  })

  it('un profil reste en cache ne laisse pas entrer', () => {
    const { group } = run({
      ...visiteur,
      onboardingShown: true,
      isProfileComplete: true,
      paywallShown: true,
      consentGiven: true,
      group: '(tabs)',
    })
    expect(group).toBe('(preonboarding)')
  })
})

describe('parcours : phases d\'attente', () => {
  it('auth non resolue -> on ne bouge pas (le splash reste)', () => {
    const { path } = run({ ...visiteur, authLoading: true, group: '(tabs)' })
    expect(path).toEqual([])
  })

  it('profil en cours de chargement -> on ne devine pas la destination', () => {
    const { path } = run({ ...nouveau, profileLoading: true, group: '(tabs)' })
    expect(path).toEqual([])
  })
})

describe('aucun etat n\'engendre de boucle', () => {
  // Balayage exhaustif : 6 booleens x 8 groupes = 512 combinaisons. `run`
  // leve si le guard n'a pas converge en 8 etapes, donc ce test suffit a
  // prouver l'absence de cycle sur tout l'espace d'etats atteignable.
  const GROUPES = [
    undefined,
    '(auth)',
    '(preonboarding)',
    'consent',
    '(onboarding)',
    'offre',
    'premium',
    '(tabs)',
  ]
  const BOOLS = [false, true]

  it('1024 combinaisons convergent', () => {
    let checked = 0
    for (const isAuthenticated of BOOLS)
      for (const profileUnavailable of BOOLS)
      for (const onboardingShown of BOOLS)
        for (const isProfileComplete of BOOLS)
          for (const paywallShown of BOOLS)
            for (const consentGiven of BOOLS)
              for (const preOnbSeen of BOOLS)
                for (const group of GROUPES) {
                  expect(() =>
                    run({
                      authLoading: false,
                      signInPending: false,
                      profileLoading: false,
                      profileUnavailable,
                      isAuthenticated,
                      onboardingShown,
                      isProfileComplete,
                      paywallShown,
                      consentGiven,
                      preOnbSeen,
                      group,
                    }),
                  ).not.toThrow()
                  checked += 1
                }
    expect(checked).toBe(1024)
  })
})
