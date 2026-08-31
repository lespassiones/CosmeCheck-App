/**
 * L'application peut-elle passer sous la barre de notifications ?
 *
 * ## Le défaut verrouillé ici
 *
 * Constaté en production le 31/08/2026 : sur la feuille « Ce qu'il faut
 * retenir », l'heure et les icônes du système se superposaient au titre et au
 * bouton de fermeture. Deux contenus se disputaient les mêmes pixels.
 *
 * La cause tient dans une ligne d'import. React Native expose un
 * `SafeAreaView`, et `react-native-safe-area-context` en expose un autre. Ils
 * portent le MÊME NOM, s'utilisent pareil, et le premier **ne fait
 * absolument rien sur Android**. Il est documenté iOS-only. Une feuille qui
 * l'utilise semble donc correcte sur un simulateur iPhone et passe sous la
 * barre système sur tout appareil Android, sans le moindre avertissement, ni au
 * typecheck, ni au build, ni au lint.
 *
 * Trois fichiers sur quarante-quatre s'étaient trompés. C'est exactement le
 * profil d'une erreur qui se recopie : celui qui ajoute une feuille copie une
 * feuille existante, et il y avait une chance sur quinze de copier la mauvaise.
 *
 * ## La règle que ce fichier tient
 *
 * **`SafeAreaView` ne s'importe QUE depuis `react-native-safe-area-context`.**
 * Le test est volontairement une interdiction globale plutôt qu'une liste de
 * fichiers surveillés : ce qu'on veut empêcher, c'est la prochaine copie.
 */
import { readFileSync } from 'node:fs'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const racine = join(__dirname, '..', '..')

/** Tous les .tsx de `app/` et `components/`, en chemins relatifs POSIX. */
function fichiersTsx(): string[] {
  const trouves: string[] = []
  const parcourir = (rel: string) => {
    for (const entree of readdirSync(join(racine, rel))) {
      const chemin = `${rel}/${entree}`
      if (statSync(join(racine, chemin)).isDirectory()) parcourir(chemin)
      else if (entree.endsWith('.tsx')) trouves.push(chemin)
    }
  }
  parcourir('app')
  parcourir('components')
  return trouves
}

/** Les sources des blocs d'import qui amenent `SafeAreaView` dans un fichier. */
function sourcesDeSafeAreaView(contenu: string): string[] {
  const sources: string[] = []
  const bloc = /import\s*\{([^}]*)\}\s*from\s*'([^']+)'/gs
  let m: RegExpExecArray | null
  while ((m = bloc.exec(contenu)) !== null) {
    if (/\bSafeAreaView\b/.test(m[1])) sources.push(m[2])
  }
  return sources
}

describe('SafeAreaView vient du bon paquet, partout', () => {
  const fichiers = fichiersTsx()

  it('trouve bien les fichiers a inspecter', () => {
    // Garde-fou du test lui-meme : s'il n'inspecte rien, il ne prouve rien.
    expect(fichiers.length).toBeGreaterThan(50)
  })

  it("aucun fichier n'importe SafeAreaView depuis 'react-native'", () => {
    const coupables: string[] = []
    for (const f of fichiers) {
      const contenu = readFileSync(join(racine, f), 'utf8')
      if (!contenu.includes('SafeAreaView')) continue
      if (sourcesDeSafeAreaView(contenu).includes('react-native')) coupables.push(f)
    }
    // Message explicite : celui qui casse ce test doit comprendre en une ligne.
    expect(coupables).toEqual([])
  })

  it("les fichiers qui l'utilisent l'importent depuis le contexte", () => {
    let comptes = 0
    for (const f of fichiers) {
      const contenu = readFileSync(join(racine, f), 'utf8')
      const sources = sourcesDeSafeAreaView(contenu)
      if (sources.length === 0) continue
      comptes += 1
      expect(sources).toContain('react-native-safe-area-context')
    }
    // L'app en compte une quarantaine : si ce nombre s'ecroule, c'est que la
    // detection ne detecte plus rien, pas que le probleme a disparu.
    expect(comptes).toBeGreaterThan(30)
  })
})

describe('aucune dimension de fenetre nest figee au chargement du module', () => {
  // Meme famille de defaut : `Dimensions.get('window')` evalue au niveau module
  // est lu UNE fois pour toute la vie du processus. Sur un appareil dont la
  // fenetre change de taille, et la fenetre de compatibilite d'un iPad se
  // redimensionne d'un geste, l'ecran garde les dimensions d'avant jusqu'au
  // redemarrage. Le tiroir du menu et le deck de suggestions en souffraient,
  // ce dernier se decentrant puisque ses cartes sont en position absolue.
  it("Dimensions.get n'est utilise nulle part hors d'un composant", () => {
    const coupables: string[] = []
    for (const f of fichiersTsx()) {
      const contenu = readFileSync(join(racine, f), 'utf8')
      // Une affectation `const X = Dimensions.get(...)` en colonne 0 est, par
      // construction, hors de tout composant : c'est du module.
      if (/^const\s+\w+\s*=\s*Dimensions\.get\(/m.test(contenu)) coupables.push(f)
    }
    expect(coupables).toEqual([])
  })
})

describe("la vitrine ne passe pas sous la barre de notifications", () => {
  const carrousel = readFileSync(
    join(racine, 'components/onboarding/PreOnboardingCarousel.tsx'),
    'utf8',
  )

  it('sa racine est une zone sure, haut et bas', () => {
    // Une illustration plein ecran gagne de la hauteur en passant sous la barre
    // systeme. C'est refuse : l'heure et les icones ne doivent jamais se poser
    // sur du contenu de l'app, illustration comprise.
    expect(carrousel).toMatch(
      /<SafeAreaView style=\{styles\.root\} edges=\{\['top', 'bottom'\]\}>/,
    )
  })
})
