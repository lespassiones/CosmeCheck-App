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

const FENETRES = [
  { nom: 'iPhone 15 Plus (430x932)', ratio: 430 / 932 },
  { nom: 'iPhone SE 3 (375x667)', ratio: 375 / 667 },
  { nom: 'fenetre iPad des captures Apple', ratio: 1390 / 2000 },
  { nom: 'iPad Air 11 pouces plein ecran', ratio: 820 / 1180 },
]

describe('geometrie : pourquoi cover coupait du texte', () => {
  it("cover rogne l'illustration des que la fenetre s'elargit", () => {
    const rognage = FENETRES.map((f) => ({
      nom: f.nom,
      perdu: 1 - partVisible('cover', RATIO_ILLUSTRATION, f.ratio),
    }))
    const parNom = Object.fromEntries(rognage.map((r) => [r.nom, r.perdu]))

    // L'iPhone de reference est au rapport de l'illustration : le cadrage ne
    // rogne presque rien, d'ou une mise en page qui semblait juste.
    expect(parNom['iPhone 15 Plus (430x932)']).toBeLessThan(0.03)

    // Partout ailleurs, ca coupe, et ca coupe en haut ET en bas.
    expect(parNom['iPhone SE 3 (375x667)']).toBeGreaterThan(0.1)
    expect(parNom['fenetre iPad des captures Apple']).toBeGreaterThan(0.3)
    expect(parNom['iPad Air 11 pouces plein ecran']).toBeGreaterThan(0.3)
  })

  it('contain ne rogne jamais rien, quelle que soit la fenetre', () => {
    for (const f of FENETRES) {
      expect(partVisible('contain', RATIO_ILLUSTRATION, f.ratio)).toBe(1)
    }
  })
})

describe('le carrousel ne peut plus tronquer ni recouvrir son texte', () => {
  const code = sansCommentaires(lire('components/onboarding/PreOnboardingCarousel.tsx'))

  it("l'illustration est affichee entiere, jamais cadree", () => {
    expect(code).toMatch(/contentFit="contain"/)
    expect(code).not.toMatch(/contentFit="cover"/)
  })

  it('la barre du bas occupe sa place au lieu de la prendre', () => {
    // C'etait la seconde cause : pastilles et bouton etaient poses en absolu
    // par-dessus l'image. Tant que le cadrage ne bougeait pas ils tombaient
    // dans la marge basse de l'illustration ; des qu'il bouge, sur du texte.
    const footer = code.match(/footer:\s*\{[\s\S]*?\n {2}\},/)
    expect(footer).not.toBeNull()
    expect(footer![0]).not.toMatch(/position:\s*'absolute'/)
    expect(code).not.toMatch(/bottomWrap/)
  })

  it("la hauteur de l'image est mesuree, pas deduite de la fenetre", () => {
    // Deduire la hauteur utile de `useWindowDimensions` ignore la barre du bas,
    // les encoches et l'indicateur d'accueil. C'est cette approximation qui a
    // coute le refus.
    expect(code).toMatch(/onLayout=\{onAreaLayout\}/)
    expect(code).toMatch(/height: areaHeight/)
  })

  it('les controles sont bornes en largeur sur une fenetre large', () => {
    expect(code).toMatch(/const CONTROLS_MAX_WIDTH = \d+/)
    expect(code).toMatch(/maxWidth: CONTROLS_MAX_WIDTH/)
  })
})

describe("le consentement annonce l'IA avant de la detailler", () => {
  const source = lire('components/consent/DataConsentScreen.tsx')

  it("l'encart IA precede la premiere section depliee", () => {
    // Un consentement eclaire ne se juge pas a ce qui est ecrit quelque part,
    // mais a ce qui est lu avant de cocher. Le destinataire des donnees doit
    // apparaitre d'emblee, pas apres deux ecrans de defilement.
    const encart = source.indexOf('styles.aiCallout')
    const premiereSection = source.indexOf('<Section')
    expect(encart).toBeGreaterThan(-1)
    expect(premiereSection).toBeGreaterThan(-1)
    expect(encart).toBeLessThan(premiereSection)
  })

  it("l'encart nomme le traitement, les fournisseurs et ce qui est transmis", () => {
    const encart = source.slice(
      source.indexOf('styles.aiCallout'),
      source.indexOf('<Section'),
    )
    expect(encart).toMatch(/intelligence artificielle/i)
    expect(encart).toMatch(/OpenAI/)
    expect(encart).toMatch(/Mistral AI/)
    expect(encart).toMatch(/profil beaut/i)
    expect(encart).toMatch(/personnalis/i)
  })

  it("l'encart dit aussi ce qui n'est PAS transmis, et ce qui n'utilise pas d'IA", () => {
    const encart = source.slice(
      source.indexOf('styles.aiCallout'),
      source.indexOf('<Section'),
    )
    expect(encart).toMatch(/Jamais ton nom/)
    expect(encart).toMatch(/Jamais pour entra/)
    expect(encart).toMatch(/calcul.{0,10}sans IA/)
  })

  it("la case a cocher nomme l'IA, puisque c'est elle qui vaut consentement", () => {
    const debut = source.indexOf('accessibilityRole="checkbox"')
    const zone = source.slice(debut, debut + 1800)
    expect(zone).toMatch(/intelligence\s*\n?\s*artificielle/i)
    expect(zone).toMatch(/OpenAI/)
    expect(zone).toMatch(/Mistral AI/)
  })
})
