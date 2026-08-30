/**
 * Les portes du demarrage peuvent-elles rester fermees pour toujours ?
 *
 * ## Le defaut verrouille ici : refus Apple 2.1(a)
 *
 * > « The app is unresponsive and stays on the splash screen after we launched
 * > it. » iPad Air 11-inch (M3), iPadOS 26.6.1, connexion active.
 *
 * Le splash NATIF de Cosme Check est retenu au demarrage (`preventAutoHideAsync`)
 * et n'etait masque qu'a UN seul endroit : le montage d'`AnimatedSplash`,
 * lui-meme conditionne au chargement des polices. Deux portes pouvaient donc ne
 * jamais s'ouvrir, et aucune ne laissait de trace :
 *
 *   1. **Les polices.** `useFonts` qui ne rend ni succes ni erreur laissait
 *      `RootLayout` renvoyer `null` a vie : l'overlay ne se montait pas,
 *      `hideAsync()` n'etait jamais appele, splash natif eternel.
 *   2. **La session.** `isLoading: false` etait bien dans un `.finally()`, mais
 *      `getSession()` n'etait borne par rien. Un reseau qui accepte la connexion
 *      sans repondre laissait la promesse en suspens, donc le `finally` jamais
 *      execute, donc un indicateur de chargement infini.
 *
 * ## Pourquoi un test de SOURCE, et pourquoi il se justifie
 *
 * Ce defaut ne se voit ni au typecheck, ni au build, ni sur un simulateur en bon
 * etat : il demande un reseau qui accepte la connexion et se tait. Ce que ce
 * test tient, ce sont les quelques lignes qui rendent la panne impossible, et
 * chacune est une ligne qu'un remaniement bien intentionne defait sans rien
 * casser d'autre. Le comportement de `withTimeout` lui-meme est teste pour de
 * vrai dans `withTimeout.test.ts`.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const racine = join(__dirname, '..', '..')
// Fins de ligne normalisees : les fichiers sont en CRLF sur Windows, et les
// motifs ci-dessous raisonnent en \n. Sans ca le test echoue selon la machine.
const lire = (p: string) => readFileSync(join(racine, p), 'utf8').replace(/\r\n/g, '\n')

/** Retire commentaires de bloc et de ligne : on compte du CODE, pas du texte. */
function sansCommentaires(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

const layout = lire('app/_layout.tsx')
const auth = lire('hooks/useAuth.ts')
const splash = lire('components/shared/AnimatedSplash.tsx')

describe('porte 1 : les polices ne peuvent plus retenir l\'app', () => {
  it('l\'erreur de useFonts est lue', () => {
    expect(layout).toMatch(/const \[fontsLoaded, fontError\] = useFonts\(/)
  })

  it('un plafond libere le rendu meme sans succes ni erreur', () => {
    // C'est le cas que lire l'erreur ne couvre PAS : une promesse en suspens ne
    // produit ni `true` ni `error`, et laissait donc la porte fermee a vie.
    expect(sansCommentaires(layout)).toMatch(/const FONTS_TIMEOUT_MS = \d+/)
    expect(layout).toMatch(/setFontsTimedOut\(true\), FONTS_TIMEOUT_MS/)
  })

  it('la porte de rendu accepte les trois issues', () => {
    expect(layout).toMatch(
      /if \(!fontsLoaded && !fontError && !fontsTimedOut\) \{/,
    )
  })
})

describe('porte 2 : le splash natif finit toujours par se retirer', () => {
  it('un filet est arme au niveau MODULE, pas dans un effet', () => {
    // Dans un effet, il ne servirait a rien : si un composant leve pendant le
    // rendu, React ne monte aucun effet. Le minuteur doit tourner meme si l'app
    // ne rend jamais rien, donc en colonne 0.
    expect(sansCommentaires(layout)).toMatch(
      /^setTimeout\(\(\) => \{\n\s+void SplashScreen\.hideAsync\(\)[\s\S]{0,80}?\}, SPLASH_HARD_LIMIT_MS\)/m,
    )
  })

  it('le plafond est declare AVANT son usage', () => {
    const code = sansCommentaires(layout)
    const declaration = code.indexOf('const SPLASH_HARD_LIMIT_MS')
    const usage = code.indexOf('}, SPLASH_HARD_LIMIT_MS)')
    expect(declaration).toBeGreaterThan(-1)
    expect(usage).toBeGreaterThan(-1)
    // Une const utilisee avant sa declaration leve a l'evaluation du module,
    // donc au tout premier instant du demarrage : le pire endroit possible.
    expect(declaration).toBeLessThan(usage)
  })

  it('la frontiere d\'erreur retire aussi le splash', () => {
    // Sinon l'ecran de repli s'affiche DERRIERE un splash toujours visible :
    // vu de l'exterieur, une app figee sur son ecran de lancement.
    const boundary = lire('components/shared/AppErrorBoundary.tsx')
    const bloc = boundary.slice(boundary.indexOf('componentDidCatch'))
    expect(bloc).toMatch(/SplashScreen\.hideAsync\(\)/)
  })

  it('l\'overlay de lancement garde son plafond de securite', () => {
    expect(sansCommentaires(splash)).toMatch(/const MAX_WAIT = \d+/)
    expect(splash).toMatch(/setForceReady\(true\), MAX_WAIT/)
    // Le fondu part sur l'un OU l'autre : jamais sur la seule auth.
    expect(splash).toMatch(/animDone && \(ready \|\| forceReady\)/)
  })
})

describe('porte 3 : la lecture de session ne peut plus ne pas finir', () => {
  const code = sansCommentaires(auth)

  it('getSession est bornee', () => {
    expect(code).toMatch(/bounded\(supabase\.auth\.getSession\(\), AUTH_BOOT_TIMEOUT_MS\)/)
  })

  it('un plafond existe, et il ne vient pas du reseau', () => {
    expect(code).toMatch(/const AUTH_BOOT_TIMEOUT_MS = \d+/)
    // `app_config` se lit par le reseau : un plafond qui depend de ce qu'il
    // protege ne protege rien.
    expect(code).not.toMatch(/AUTH_BOOT_TIMEOUT_MS[^\n]*(app_config|useAppConfig)/)
    expect(code).not.toMatch(/(app_config|useAppConfig)[^\n]*AUTH_BOOT_TIMEOUT_MS/)
  })

  it('isLoading bascule dans un finally', () => {
    const debut = code.indexOf('} finally {')
    expect(debut).toBeGreaterThan(-1)
    const bloc = code.slice(debut, code.indexOf('})()', debut))
    expect(bloc).toMatch(/useAuthStore\.setState\(\{ isLoading: false \}\)/)
  })

  it('un delai depasse ne purge PAS la session', () => {
    // Un reseau muet n'est pas un jeton invalide. Purger ici mettrait dehors
    // quiconque ouvre l'app hors ligne avec un jeton expire.
    const depasse = code.slice(code.indexOf("res.reason === 'error'"))
    const brancheTimeout = depasse.slice(depasse.indexOf('} else {'), depasse.indexOf('} finally {'))
    expect(brancheTimeout).not.toMatch(/signOut/)
    expect(brancheTimeout).not.toMatch(/setSession\(null\)/)
  })

  it('une erreur AVEREE purge bien la session', () => {
    expect(code).toMatch(/res\.reason === 'error'[\s\S]{0,220}?signOut\(\{ scope: 'local' \}\)/)
  })
})

describe("porte 4 : le questionnaire ne se demonte pas en cours de route", () => {
  // Constate sur iPhone le 28/08/2026 : ecran blanc fige avec un spinner, en
  // plein questionnaire, juste apres avoir choisi une preoccupation.
  //
  // `isProfileComplete` devient vrai des que DEUX des trois sections du profil
  // sont remplies. Repondre au type de peau (etape 1) puis a une preoccupation
  // (etape 4) suffit donc a le faire basculer EN PLEIN parcours. Le layout de
  // `(onboarding)` s'en servait comme critere d'ejection et remplacait le
  // questionnaire par un indicateur de chargement ; comme l'AuthGuard, lui, ne
  // redirige pas tant que l'onboarding n'est pas explicitement termine, plus
  // rien ne bougeait.
  const layoutOnboarding = lire("app/(onboarding)/_layout.tsx")
  const code = sansCommentaires(layoutOnboarding)

  it("le layout n'ejecte JAMAIS sur isProfileComplete", () => {
    expect(code).not.toMatch(/isProfileComplete/)
  })

  it("il n'ejecte que sur onboardingShown, qui n'est vrai qu'a la fin", () => {
    // La decision vit desormais dans une fonction pure, verrouillee par son
    // propre test (bootDeadlock). Ce qu'on tient ici, c'est que le layout
    // n'ait pas de second avis a lui.
    const gate = sansCommentaires(lire('lib/navigation/onboardingGate.ts'))
    expect(gate).toMatch(/if \(onboardingShown\) return paywallShown/)
    expect(gate).not.toMatch(/isProfileComplete/)
  })

  it("l'AuthGuard applique la meme regle", () => {
    // Regle 6 de authRoute : on quitte l'onboarding UNIQUEMENT sur
    // onboardingShown. Si les deux divergent a nouveau, l'un des deux
    // demontera le questionnaire pendant que l'autre refusera de rediriger.
    const guard = sansCommentaires(lire("lib/navigation/authRoute.ts"))
    expect(guard).toMatch(/if \(onboardingShown && inOnboarding\)/)
  })
})


describe("porte 3 : la lecture de profil ne peut plus pendre indefiniment", () => {
  // Production Android, build 25, le 30/08/2026 : cercle violet infini a
  // l'ouverture. C'etait la TROISIEME porte du demarrage, la seule qui n'avait
  // jamais ete bornee. React Query n'impose aucun delai, et le reseau de React
  // Native sur Android non plus (OkHttp y est configure sans readTimeout) : un
  // serveur qui accepte la connexion et se tait laissait `isLoading` vrai a vie.
  const profil = lire('hooks/useProfile.ts')
  const code = sansCommentaires(profil)

  it('un plafond existe, en constante du code', () => {
    expect(code).toMatch(/export const PROFILE_TIMEOUT_MS = \d+/)
  })

  it('la requete passe reellement par ce plafond', () => {
    expect(code).toMatch(/withTimeout\([\s\S]{0,200}?PROFILE_TIMEOUT_MS/)
  })

  it('les reprises sont bornees, sinon le plafond ne plafonne rien', () => {
    // Sans `retry` explicite, trois reprises a delai croissant repoussent la
    // decision bien au-dela du plafond : le plafond serait alors decoratif.
    expect(code).toMatch(/retry: 1/)
    expect(code).toMatch(/retryDelay: \d+/)
  })

  it("l'absence de profil est signalee, jamais lue comme un profil vide", () => {
    // Sans ce drapeau, `onboardingShown` vaut faux par defaut et on renvoie au
    // questionnaire quelqu'un qui l'a termine il y a des mois.
    expect(code).toMatch(/profileUnavailable/)
  })
})

describe("porte 5 : l'ecran de demarrage ne delegue plus sa sortie", () => {
  const layout = sansCommentaires(lire("app/(onboarding)/_layout.tsx"))

  it('un plafond convertit toute attente en destination', () => {
    expect(layout).toMatch(/const LOADER_MAX_MS = \d+/)
    expect(layout).toMatch(/setWaitedTooLong\(true\), LOADER_MAX_MS/)
  })

  it("les sorties passent par Redirect, sans dependre du moindre segment", () => {
    // C'est tout le correctif : l'ecran attendait que l'AuthGuard le demonte,
    // et la regle du guard est conditionnee au segment `(onboarding)` que cet
    // ecran supprimait justement en rendant une View au lieu de son Stack.
    expect(layout).toMatch(/case 'home':[\s\S]{0,120}?<Redirect/)
    expect(layout).toMatch(/case 'paywall':[\s\S]{0,400}?<Redirect/)
    expect(layout).toMatch(/case 'preonboarding':[\s\S]{0,120}?<Redirect/)
  })
})

describe("porte 6 : une abstention du garde ne peut pas devenir definitive", () => {
  const guard = sansCommentaires(layout)

  it('les drapeaux memoire sont observables, pas seulement lisibles', () => {
    // `isSignInPending` et `hasSeenPreOnboardingThisLaunch` sont des booleens
    // de module : ils n'apparaissent dans aucune liste de dependances React.
    // Quand le garde s'abstenait a cause de l'un d'eux, rien ne le reveillait
    // a sa retombee.
    expect(guard).toMatch(/useSyncExternalStore\(\s*subscribeSignInPending/)
    expect(guard).toMatch(/useSyncExternalStore\(\s*subscribePreOnboarding/)
  })

  it('une navigation emise avant le montage du navigateur est rejouee', () => {
    // expo-router refuse silencieusement une navigation trop precoce. La cle
    // de l'etat de navigation sert de garde ET de declencheur de rejeu.
    expect(guard).toMatch(/useRootNavigationState\(\)\?\.key/)
    expect(guard).toMatch(/if \(!navKey\) return/)
  })
})
