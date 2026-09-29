/**
 * Plafond de pile : au-delà de 6 écrans au-dessus des onglets, le nouvel écran
 * remplace le sommet au lieu de s'empiler.
 */
import { MAX_SCREENS_ABOVE_TABS, screensAboveTabs, shouldReplaceOnPush } from '../navigation/stackCap'

const stack = (above: string[], index?: number) => ({
  index: index ?? above.length,
  routes: [{ name: '(tabs)' }, ...above.map((name) => ({ name }))],
})

describe('screensAboveTabs', () => {
  it('compte les écrans au-dessus des onglets', () => {
    expect(screensAboveTabs(stack([]))).toBe(0)
    expect(screensAboveTabs(stack(['analyse/[id]', 'alternatives/[ean]']))).toBe(2)
  })

  it("suit l'index (écran réellement au sommet)", () => {
    expect(screensAboveTabs(stack(['a', 'b', 'c'], 1))).toBe(1)
  })

  it('trouve les onglets dans un navigateur imbriqué (racine expo-router)', () => {
    const root = { index: 0, routes: [{ name: '__root', state: stack(['analyse/[id]', 'analyse/[id]', 'analyse/[id]']) }] }
    expect(screensAboveTabs(root)).toBe(3)
  })

  it('état inconnu ou sans onglets : 0', () => {
    expect(screensAboveTabs(undefined)).toBe(0)
    expect(screensAboveTabs({ routes: [{ name: '(auth)' }] })).toBe(0)
    expect(screensAboveTabs('x')).toBe(0)
  })
})

describe('shouldReplaceOnPush', () => {
  it(`empile jusqu'à ${MAX_SCREENS_ABOVE_TABS - 1} écrans, remplace à partir de ${MAX_SCREENS_ABOVE_TABS}`, () => {
    const names = (n: number) => Array.from({ length: n }, (_, i) => (i % 2 ? 'alternatives/[ean]' : 'analyse/[id]'))
    expect(shouldReplaceOnPush(stack(names(MAX_SCREENS_ABOVE_TABS - 1)))).toBe(false)
    expect(shouldReplaceOnPush(stack(names(MAX_SCREENS_ABOVE_TABS)))).toBe(true)
    expect(shouldReplaceOnPush(stack(names(15)))).toBe(true)
  })

  it('sans état lisible, on empile (jamais de blocage)', () => {
    expect(shouldReplaceOnPush(undefined)).toBe(false)
  })
})
