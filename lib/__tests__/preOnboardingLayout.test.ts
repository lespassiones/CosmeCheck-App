/**
 * La vitrine peut-elle tronquer ou recouvrir son propre texte ?
 *
 * ## Le défaut verrouillé ici : refus Apple guideline 4 (Design)
 *
 * > « the app has a crowded interface or is laid out in a way that makes it
 * > difficult to complete tasks. » iPad Air 11 pouces (M3), 31/08/2026.
 *
 * Les captures d'Apple montraient, sur le carrousel de présentation : les
 * pastilles de pagination posées au milieu d'un sous-titre, un badge coupé en
 * haut d'illustration, et un titre tranché horizontalement par le bouton.
 *
 * Le point qui rend ce défaut particulier : **les titres et sous-titres sont
 * dessinés DANS les images** (`assets/images/PreOnboarding/ecran{1..4}.webp`).
 * Ici, rogner l'image, c'est rogner du texte. Deux décisions de mise en page
 * suffisaient donc à casser l'écran, et le test ci-dessous chiffre la première.
 *
 * ## Pourquoi un test de SOURCE, et pourquoi il se justifie
 *
 * Rien de tout ça ne se voit au typecheck ni sur un simulateur au bon format :
 * il faut une fenêtre au mauvais rapport. Ce que ce fichier tient, ce sont les
 * deux lignes qui rendent la panne impossible, et chacune est une ligne qu'un
 * remaniement bien intentionné défait sans rien casser d'autre.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const racine = join(__dirname, '..', '..')
const lire = (p: string) => readFileSync(join(racine, p), 'utf8').replace(/\r\n/g, '\n')

/** Retire commentaires de bloc et de ligne : on compte du CODE, pas du texte. */
function sansCommentaires(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

/**
 * Part de la HAUTEUR de l'illustration réellement visible.
 *
 * `cover` prend l'échelle maximale, donc sur une fenêtre relativement plus
 * large que l'image, c'est la largeur qui commande et le haut comme le bas
 * sont coupés. `contain` prend l'échelle minimale, donc rien n'est jamais
 * coupé, au prix de bandes de remplissage.
 */
function partVisible(
  mode: 'cover' | 'contain',
  ratioImage: number,
  ratioFenetre: number,
): number {
  if (mode === 'contain') return 1
  return Math.min(1, ratioImage / ratioFenetre)
}

/** Rapport largeur/hauteur des quatre illustrations, mesuré sur les fichiers. */
const RATIO_ILLUSTRATION = 0.472

/**
 * Tous les formats Apple, du plus etroit au plus large.
 *
 * ⚠️ Le rapport a retenir pour l'iPad n'est PAS celui de son ecran (0,695) :
 * une app iPhone n'y tourne pas en plein ecran mais dans une fenetre de
 * compatibilite. Mesuree sur les captures d'Apple (~1080x1950 dans un ecran de
 * 1640x2360), elle vaut ~0,55, soit le rapport d'un iPhone SE. Les deux
 * rapports d'iPad plein ecran sont la pour le jour ou `supportsTablet`
 * passerait a `true` : ce sont eux qui deviendraient la realite.
 */
const FENETRES = [
  { nom: 'iPhone 16 Pro Max (440x956)', ratio: 440 / 956 },
  { nom: 'iPhone 15 Plus (430x932)', ratio: 430 / 932 },
  { nom: 'iPhone 15 / 16 (393x852)', ratio: 393 / 852 },
  { nom: 'iPhone 13 mini (375x812)', ratio: 375 / 812 },
  { nom: 'iPhone SE 3 (375x667)', ratio: 375 / 667 },
  { nom: 'fenetre de compatibilite iPad (mesuree chez Apple)', ratio: 1080 / 1950 },
  { nom: 'iPad Air 11 pouces portrait plein ecran', ratio: 820 / 1180 },
  { nom: 'iPad Air 11 pouces paysage plein ecran', ratio: 1180 / 820 },
]

describe('geometrie : pourquoi cover coupait du texte', () => {
  it("cover rogne l'illustration des que la fenetre s'elargit", () => {
    const rognage = FENETRES.map((f) => ({
      nom: f.nom,
      perdu: 1 - partVisible('cover', RATIO_ILLUSTRATION, f.ratio),
    }))
    const parNom = Object.fromEntries(rognage.map((r) => [r.nom, r.perdu]))

    // Les iPhone recents sont au rapport de l'illustration : le cadrage ne
    // rogne presque rien, d'ou une mise en page qui semblait juste.
    expect(parNom['iPhone 15 Plus (430x932)']).toBeLessThan(0.03)
    expect(parNom['iPhone 15 / 16 (393x852)']).toBeLessThan(0.03)
    expect(parNom['iPhone 16 Pro Max (440x956)']).toBeLessThan(0.03)
    expect(parNom['iPhone 13 mini (375x812)']).toBeLessThan(0.03)

    // Partout ailleurs ca coupe, en haut ET en bas. Et le format qu'Apple a
    // vu, la fenetre de compatibilite, rogne autant qu'un iPhone SE : c'est
    // le meme defaut, pas un defaut d'iPad.
    expect(parNom['iPhone SE 3 (375x667)']).toBeGreaterThan(0.1)
    expect(parNom['fenetre de compatibilite iPad (mesuree chez Apple)']).toBeGreaterThan(0.1)
    expect(parNom['iPad Air 11 pouces portrait plein ecran']).toBeGreaterThan(0.3)
    expect(parNom['iPad Air 11 pouces paysage plein ecran']).toBeGreaterThan(0.6)
  })

  it('contain ne rogne jamais rien, quelle que soit la fenetre', () => {
    for (const f of FENETRES) {
      expect(partVisible('contain', RATIO_ILLUSTRATION, f.ratio)).toBe(1)
    }
  })
})

describe("les ecrans d'accroche ne peuvent pas tronquer ni recouvrir leur texte", () => {
  // Depuis le 28/09/2026 la vitrine est l'accroche de l'onboarding
  // « Le diagnostic de Perle » (components/onboarding/flow/steps/Hooks.tsx).
  // Memes lecons que le carrousel qu'elle remplace.
  const code = sansCommentaires(lire('components/onboarding/flow/steps/Hooks.tsx'))

  it('les illustrations sont affichees entieres, jamais cadrees', () => {
    expect(code).toMatch(/contentFit="contain"/)
    expect(code).not.toMatch(/contentFit="cover"/)
  })

  it('la barre du bas occupe sa place au lieu de la prendre', () => {
    const footer = code.match(/footer:\s*\{[\s\S]*?\},/)
    expect(footer).not.toBeNull()
    expect(footer![0]).not.toMatch(/position:\s*'absolute'/)
  })

  it("le contenu defile si la fenetre est trop courte (iPhone SE, fenetre iPad)", () => {
    expect(code).toMatch(/<ScrollView/)
  })

  it('la colonne est bornee en largeur sur une fenetre large', () => {
    expect(code).toMatch(/maxWidth: FLOW_MAX_WIDTH/)
  })
})

describe("le consentement annonce l'IA avant de la detailler", () => {
  // Le texte integral vit dans ConsentDetails (ex-DataConsentScreen) ; l'ecran
  // du parcours (steps/Consent.tsx) en montre l'essentiel et porte la case.
  const source = lire('components/consent/ConsentDetails.tsx')
  const ecran = lire('components/onboarding/flow/steps/Consent.tsx')

  it('la politique de confidentialite nomme la meme technologie', () => {
    const privacy = lire('app/legal/privacy.tsx')
    expect(privacy).toMatch(/ChatGPT/)
    expect(privacy).toMatch(/Mistral/)
  })

  it("l'encart IA precede la premiere section depliee", () => {
    const encart = source.indexOf('styles.aiCallout')
    const premiereSection = source.indexOf('<Section')
    expect(encart).toBeGreaterThan(-1)
    expect(premiereSection).toBeGreaterThan(-1)
    expect(encart).toBeLessThan(premiereSection)
  })

  it("l'encart nomme le traitement, les fournisseurs et ce qui est transmis", () => {
    const encart = source.slice(source.indexOf('styles.aiCallout'), source.indexOf('<Section'))
    expect(encart).toMatch(/intelligence artificielle/i)
    expect(encart).toMatch(/OpenAI/)
    expect(encart).toMatch(/Mistral AI/)
    expect(encart).toMatch(/ChatGPT/)
    expect(encart).toMatch(/profil beaut/i)
    expect(encart).toMatch(/personnalis/i)
  })

  it("l'encart dit aussi ce qui n'est PAS transmis, et ce qui n'utilise pas d'IA", () => {
    const encart = source.slice(source.indexOf('styles.aiCallout'), source.indexOf('<Section'))
    expect(encart).toMatch(/Jamais ton nom/)
    expect(encart).toMatch(/Jamais pour entra/)
    expect(encart).toMatch(/calcul.{0,10}sans IA/)
  })

  it("l'ecran du parcours nomme les destinataires AVANT la case, et ouvre le texte integral", () => {
    const case_ = ecran.indexOf('accessibilityRole="checkbox"')
    const avant = ecran.slice(0, case_)
    expect(avant).toMatch(/OpenAI/)
    expect(avant).toMatch(/Mistral AI/)
    expect(ecran).toMatch(/<ConsentDetails \/>/)
  })

  it("le bloc « Qui les traite », juste au-dessus de la case, nomme l'IA et ses fournisseurs", () => {
    // Depuis le 28/09/2026 la case est courte (choix produit) : la mention des
    // destinataires ne doit donc JAMAIS quitter ce bloc, lu avant de cocher.
    const bloc = ecran.slice(ecran.indexOf("title: 'Qui les traite'"), ecran.indexOf("title: 'Ton choix'"))
    expect(bloc).toMatch(/IA/)
    expect(bloc).toMatch(/OpenAI/)
    expect(bloc).toMatch(/Mistral AI/)
    expect(bloc).toMatch(/ChatGPT/)
    expect(ecran.indexOf("title: 'Qui les traite'")).toBeLessThan(ecran.indexOf('accessibilityRole="checkbox"'))
  })

  it("la case n'est jamais pre-cochee", () => {
    expect(ecran).toMatch(/useState\(false\)/)
  })
})
