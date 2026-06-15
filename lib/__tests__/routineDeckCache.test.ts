jest.mock('@react-native-async-storage/async-storage', () => {
  const store: Record<string, string> = {}
  return {
    __esModule: true,
    default: {
      getItem: (k: string) => Promise.resolve(store[k] ?? null),
      setItem: (k: string, v: string) => {
        store[k] = v
        return Promise.resolve()
      },
      removeItem: (k: string) => {
        delete store[k]
        return Promise.resolve()
      },
    },
  }
})

import { routineSignature, readDeckCache, writeDeckCache } from '@/lib/routine/deckCache'

describe('routineSignature', () => {
  it('indépendante de l\'ordre', () => {
    const a = routineSignature([
      { analysis_id: 'x', frequency: 'daily' },
      { analysis_id: 'y', frequency: 'weekly' },
    ])
    const b = routineSignature([
      { analysis_id: 'y', frequency: 'weekly' },
      { analysis_id: 'x', frequency: 'daily' },
    ])
    expect(a).toBe(b)
  })

  it('change si la fréquence ou un produit change', () => {
    const base = routineSignature([{ analysis_id: 'x', frequency: 'daily' }])
    expect(routineSignature([{ analysis_id: 'x', frequency: 'weekly' }])).not.toBe(base)
    expect(routineSignature([{ analysis_id: 'z', frequency: 'daily' }])).not.toBe(base)
    expect(
      routineSignature([
        { analysis_id: 'x', frequency: 'daily' },
        { analysis_id: 'z', frequency: 'daily' },
      ]),
    ).not.toBe(base)
  })
})

describe('deckCache (AsyncStorage mocké)', () => {
  it('write puis read même signature → renvoie le deck', async () => {
    const sig = 'sig-1'
    await writeDeckCache(sig, [{ key: 'a' }, { key: 'b' }])
    const got = await readDeckCache<{ key: string }>(sig)
    expect(got?.map((x) => x.key)).toEqual(['a', 'b'])
  })

  it('signature différente (routine changée) → null', async () => {
    await writeDeckCache('sig-A', [{ key: 'a' }])
    const got = await readDeckCache('sig-B')
    expect(got).toBeNull()
  })
})
