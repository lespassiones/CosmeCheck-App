/**
 * Garde-fou : AUCUN écran ne doit activer freezeOnBlur (ni enableFreeze).
 *
 * react-native-screens 4.16 (DelayedFreeze) peut geler un écran dans le MÊME
 * rendu que sa désactivation quand deux navigations se suivent de près (deux
 * taps rapprochés, JS occupé) : la vue native reste « au premier plan », la
 * barre affiche Accueil sur le contenu de Routine, ou l'écran reste blanc
 * (issue software-mansion/react-native-screens#4518). Build iOS 10, 29/09/2026.
 * Rejoué avec React 19.1 et le code exact de la librairie avant le retrait.
 */
import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'

const ROOT = join(__dirname, '..', '..')
const DIRS = ['app', 'components', 'hooks', 'lib']

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    if (name === '__tests__' || name === 'node_modules') continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full))
    else if (/\.(tsx?|jsx?)$/.test(name)) out.push(full)
  }
  return out
}

describe('freezeOnBlur interdit', () => {
  const files = DIRS.flatMap((d) => sourceFiles(join(ROOT, d)))

  it('parcourt bien les sources', () => {
    expect(files.length).toBeGreaterThan(50)
  })

  it("aucun écran n'active freezeOnBlur ni enableFreeze", () => {
    const offenders = files.filter((f) => {
      const src = readFileSync(f, 'utf8')
      return /freezeOnBlur\s*[:=]\s*\{?\s*true/.test(src) || /enableFreeze\s*\(/.test(src)
    })
    expect(offenders.map((f) => f.slice(ROOT.length + 1))).toEqual([])
  })
})
