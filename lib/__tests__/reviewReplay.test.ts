/**
 * Rejeu du parcours d'accueil pour le compte de demonstration d'Apple.
 *
 * Le verificateur d'Apple se connecte avec un compte deja onboarde : sans ce
 * mecanisme il atterrit sur l'accueil et ne voit ni l'ecran de consentement, ni
 * le questionnaire de profil, ni l'opt-in notifications. Il peut refuser l'app
 * pour un ecran qu'il n'a pas pu observer.
 *
 * On ne teste ici que la logique PURE. L'ecriture en base et le nettoyage du
 * stockage local sont branches dans `lib/auth/session.ts` et verifies en vrai
 * sur appareil.
 */
import {
  REPLAYED_KEYS,
  REVIEW_REPLAY_FLAG,
  isReviewReplayAccount,
  stripForReplay,
} from '@/lib/auth/reviewReplay'

/** Un compte de demonstration tel qu'il est apres un parcours complet. */
const compteOnboarde = {
  review_replay: true,
  onboardingShown: true,
  paywall_shown: true,
  data_consent: { granted: true, at: '2026-08-01T10:00:00.000Z', version: 1 },
  skin: { skinTypeFace: 'normale', concerns: ['acne', 'rides'] },
  notifications: { enabled: true, promptSeen: true, bilanHour: 18 },
  restrictions: { families: ['silicone'], ingredients: [] },
}

describe('designation du compte', () => {
  it('reconnait le drapeau', () => {
    expect(isReviewReplayAccount(compteOnboarde)).toBe(true)
  })

  it('un compte ordinaire n\'est JAMAIS concerne', () => {
    expect(isReviewReplayAccount({ onboardingShown: true })).toBe(false)
    expect(isReviewReplayAccount({})).toBe(false)
    expect(isReviewReplayAccount(null)).toBe(false)
    expect(isReviewReplayAccount(undefined)).toBe(false)
  })

  it('seul le booleen vrai compte, pas une valeur ressemblante', () => {
    // Une chaine 'true' ou un 1 venus d'un import maladroit ne doivent pas
    // transformer un compte reel en compte de demonstration.
    expect(isReviewReplayAccount({ review_replay: 'true' })).toBe(false)
    expect(isReviewReplayAccount({ review_replay: 1 })).toBe(false)
  })
})

describe('remise a zero du parcours', () => {
  const apres = stripForReplay(compteOnboarde)

  it.each(REPLAYED_KEYS)('efface %s', (cle) => {
    expect(apres).not.toHaveProperty(cle)
  })

  it('le questionnaire repart VIERGE, sans reponse pre-cochee', () => {
    // C'est la demande explicite : aucune case cochee d'avance.
    expect(apres.skin).toBeUndefined()
  })

  it('le consentement sera redemande', () => {
    expect(apres.data_consent).toBeUndefined()
  })

  it('conserve le drapeau, sinon le rejeu n\'aurait lieu qu\'une fois', () => {
    expect(apres[REVIEW_REPLAY_FLAG]).toBe(true)
    // Et il tient sur plusieurs connexions successives.
    expect(stripForReplay(stripForReplay(apres))[REVIEW_REPLAY_FLAG]).toBe(true)
  })

  it('ne touche pas aux cles etrangeres au parcours', () => {
    expect(apres.restrictions).toEqual(compteOnboarde.restrictions)
  })

  it('ne modifie pas l\'objet d\'origine', () => {
    const copie = JSON.parse(JSON.stringify(compteOnboarde))
    stripForReplay(compteOnboarde)
    expect(compteOnboarde).toEqual(copie)
  })

  it('supporte des preferences absentes ou mal formees', () => {
    for (const entree of [null, undefined, [] as unknown]) {
      const r = stripForReplay(entree as Record<string, unknown> | null)
      expect(r[REVIEW_REPLAY_FLAG]).toBe(true)
    }
  })
})

describe('le rejeu est branche sur le SEUL chemin e-mail plus mot de passe', () => {
  const fs = require('node:fs') as typeof import('node:fs')
  const path = require('node:path') as typeof import('node:path')
  const lire = (p: string) =>
    fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8').replace(/\r\n/g, '\n')

  it('la logique pure ne depend de rien (importable sans bouchon)', () => {
    // Si ce module reimportait Supabase ou AsyncStorage, ce fichier de test ne
    // pourrait plus se charger du tout en environnement node.
    const mod = lire('lib/auth/reviewReplay.ts')
    expect(mod).not.toMatch(/^import /m)
  })

  it('signIn (e-mail + mot de passe) le declenche', () => {
    const session = lire('lib/auth/session.ts')
    const bloc = session.slice(
      session.indexOf('export async function signIn('),
      session.indexOf('export async function signUp('),
    )
    expect(bloc).toMatch(/replayOnboardingIfReviewAccount\(data\.user\?\.id\)/)
  })

  it('aucun autre chemin d\'authentification ne le declenche', () => {
    // Google et Apple ne sont pas utilises par la verification d'Apple, et
    // elargir le declencheur exposerait de vrais comptes a une remise a zero.
    for (const f of ['lib/auth/google.ts', 'lib/auth/apple.ts']) {
      expect(lire(f)).not.toMatch(/replayOnboardingIfReviewAccount/)
    }
  })

  it('le paywall ne se derobe PAS au compte de demonstration', () => {
    // Le compte est premium, et le paywall post-onboarding se ferme tout seul
    // dans ce cas : le verificateur ne verrait jamais l'offre. On excepte donc
    // explicitement ce compte de la fermeture automatique.
    const offre = lire('app/offre/index.tsx')
    expect(offre).toMatch(
      /if \(fromOnboarding && isPremium && !isReviewAccount\) void dismissOnboardingPaywall\(\)/,
    )
    expect(offre).toMatch(/isReviewReplayAccount\(/)
  })

  it('paywall_shown fait partie des cles remises a zero', () => {
    // Sans ca le guard ne routerait pas vers le paywall apres le questionnaire.
    expect(REPLAYED_KEYS).toContain('paywall_shown')
  })

  it('aucune adresse e-mail n\'est ecrite en dur dans le module', () => {
    // Le compte est designe par un drapeau en base : une adresse figee dans le
    // binaire se lit dans le paquet et ne se change plus sans republier.
    const mod = lire('lib/auth/reviewReplay.ts')
    const code = mod.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(code).not.toMatch(/@cosme-check\.com|@[a-z0-9.-]+\.[a-z]{2,}/i)
  })
})
