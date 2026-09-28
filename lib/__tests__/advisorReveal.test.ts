import {
  discAt,
  fabOpacity,
  REVEAL_WAVES,
  revealGeometry,
  waveProgress,
} from '@/lib/navigation/advisorReveal'

// Téléphone type (390 x 844), bouton de 56 à 16 px du bord droit, 116 px au-dessus du bas.
const W = 390
const H = 844
const FAB_R = 28
const FAB_X = W - 16 - FAB_R
const FAB_Y = H - 116 - FAB_R
const g = revealGeometry(W, H, FAB_X, FAB_Y, FAB_R)

// Même courbe que le composant (ease-in-out cubique), pour tester le rendu réel.
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const discs = (p: number) => REVEAL_WAVES.map((w) => discAt(ease(waveProgress(p, w)), g))
const covers = (d: { cx: number; cy: number; r: number }, x: number, y: number) =>
  Math.hypot(x - d.cx, y - d.cy) <= d.r

describe('advisorReveal', () => {
  it('au départ, chaque disque est caché sous le bouton Perle', () => {
    for (const d of discs(0)) {
      expect(d.cx).toBe(FAB_X)
      expect(d.cy).toBe(FAB_Y)
      expect(d.r).toBeLessThan(FAB_R)
    }
  })

  it("à la fin, chaque disque couvre les quatre coins de l'écran", () => {
    for (const d of discs(1)) {
      for (const [x, y] of [[0, 0], [W, 0], [0, H], [W, H]]) {
        expect(covers(d, x, y)).toBe(true)
      }
    }
  })

  it('les rayons ne font que grandir avec la progression', () => {
    let previous = discs(0)
    for (let p = 0.02; p <= 1.0001; p += 0.02) {
      const current = discs(p)
      current.forEach((d, i) => expect(d.r).toBeGreaterThanOrEqual(previous[i].r))
      previous = current
    }
  })

  it('le disque du dessous reste toujours le plus grand (sinon il serait masqué)', () => {
    for (let p = 0; p <= 1.0001; p += 0.02) {
      const [a, b, c] = discs(p)
      expect(a.r).toBeGreaterThanOrEqual(b.r)
      expect(b.r).toBeGreaterThanOrEqual(c.r)
    }
  })

  it("le dernier disque ne couvre l'écran qu'à la fin", () => {
    expect(covers(discs(0.9)[2], 0, 0)).toBe(false)
    expect(covers(discs(1)[2], 0, 0)).toBe(true)
  })

  it('le cercle monte vers le centre en grandissant', () => {
    const mid = discs(0.5)[0]
    expect(mid.cy).toBeLessThan(FAB_Y)
    expect(mid.cx).toBeLessThan(FAB_X)
  })

  it("Perle reste visible pendant les vagues puis s'efface", () => {
    expect(fabOpacity(0)).toBe(1)
    expect(fabOpacity(0.5)).toBe(1)
    expect(fabOpacity(0.7)).toBeGreaterThan(0)
    expect(fabOpacity(0.7)).toBeLessThan(1)
    expect(fabOpacity(0.85)).toBe(0)
    expect(fabOpacity(1)).toBe(0)
  })
})
