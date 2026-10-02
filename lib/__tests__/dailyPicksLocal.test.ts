/**
 * Catalogue local du quiz (1000 questions embarquées, 100 jours de 10).
 */
import { buildLocalCatalog, LOCAL_PACKS, shuffleOptions } from '@/lib/dailyPicks/local'
import { pickTodaysItems } from '@/lib/dailyPicks/select'

const catalog = buildLocalCatalog()

describe('catalogue local du quiz', () => {
  it('10 packs de 100 questions = 1000 questions', () => {
    expect(LOCAL_PACKS).toHaveLength(10)
    LOCAL_PACKS.forEach((p) => expect(p).toHaveLength(100))
    expect(catalog).toHaveLength(1000)
  })

  it('chaque question est complète et cohérente', () => {
    for (const it of catalog) {
      expect(it.question.trim().length).toBeGreaterThan(5)
      expect(it.reveal.trim().length).toBeGreaterThan(10)
      expect(it.options).toHaveLength(it.kind === 'quiz' ? 4 : 3)
      expect(new Set(it.options).size).toBe(it.options.length)
      expect(it.correct_index).toBeGreaterThanOrEqual(0)
      expect(it.correct_index).toBeLessThan(it.options.length)
    }
  })

  it('aucun tiret cadratin ni demi-cadratin', () => {
    for (const it of catalog) {
      const text = [it.question, it.reveal, ...it.options].join(' ')
      expect(text).not.toMatch(/[—–]/)
    }
  })

  it('pas de question en double', () => {
    const keys = catalog.map((i) => i.question.toLowerCase().trim())
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('le mélange garde la bonne réponse et varie sa position', () => {
    const positions = new Set<number>()
    for (const pack of LOCAL_PACKS) {
      for (const pick of pack) {
        const s = shuffleOptions(pick)
        expect(s.options[s.correct_index]).toBe(pick.options[pick.correct_index])
        if (pick.kind === 'quiz') positions.add(s.correct_index)
      }
    }
    expect(positions.size).toBe(4)
  })

  it('100 jours consécutifs couvrent les 1000 questions sans répétition', () => {
    const seen = new Set<string>()
    for (let d = 0; d < 100; d++) {
      pickTodaysItems(catalog, new Date(d * 86_400_000)).forEach((i) => seen.add(i.id))
    }
    expect(seen.size).toBe(1000)
  })

  it('deux jours consécutifs viennent de packs différents', () => {
    const packOf = (i: number) => catalog[i * 10].id.split('-')[1]
    for (let d = 0; d < 99; d++) expect(packOf(d)).not.toBe(packOf(d + 1))
  })
})
