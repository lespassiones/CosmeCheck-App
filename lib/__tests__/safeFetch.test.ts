/**
 * safeFetch — suivi manuel des redirections avec re-validation SSRF de chaque
 * saut. Test pur (node) avec global.fetch mocké : aucune requête réseau réelle.
 */
import { safeFetch, SsrfBlockedError } from '../../supabase/functions/_shared/safeFetch'

type MockRes = {
  status: number
  headers: { has: (k: string) => boolean; get: (k: string) => string | null }
  ok: boolean
  body: { cancel: () => Promise<void> } | null
  __url: string
}

function res(status: number, location?: string): MockRes {
  const headers = new Map<string, string>()
  if (location) headers.set('location', location)
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      has: (k) => headers.has(k.toLowerCase()),
      get: (k) => headers.get(k.toLowerCase()) ?? null,
    },
    body: { cancel: () => Promise.resolve() },
    __url: '',
  }
}

/** Installe un mock de fetch qui renvoie une réponse par URL appelée, et
 *  enregistre l'ordre des URLs réellement fetchées. */
function mockFetchByUrl(map: Record<string, MockRes>) {
  const calls: string[] = []
  const fn = jest.fn((input: string) => {
    calls.push(input)
    const r = map[input]
    if (!r) throw new Error(`no mock for ${input}`)
    return Promise.resolve(r as unknown as Response)
  })
  // @ts-expect-error — on remplace le global fetch pour le test
  global.fetch = fn
  return calls
}

afterEach(() => {
  jest.restoreAllMocks()
})

describe('safeFetch — redirections SSRF', () => {
  it('bloque une redirection vers une IP interne (metadata cloud) SANS la fetcher', async () => {
    const calls = mockFetchByUrl({
      'https://shop.example.com/p': res(302, 'http://169.254.169.254/latest/meta-data/'),
    })
    await expect(safeFetch('https://shop.example.com/p')).rejects.toBeInstanceOf(SsrfBlockedError)
    // La cible interne ne doit JAMAIS avoir été appelée.
    expect(calls).toEqual(['https://shop.example.com/p'])
    expect(calls).not.toContain('http://169.254.169.254/latest/meta-data/')
  })

  it('bloque une redirection vers localhost', async () => {
    mockFetchByUrl({
      'https://shop.example.com/p': res(301, 'http://localhost:8080/admin'),
    })
    await expect(safeFetch('https://shop.example.com/p')).rejects.toBeInstanceOf(SsrfBlockedError)
  })

  it('suit une redirection vers une autre URL publique et renvoie la réponse finale', async () => {
    const final = res(200)
    const calls = mockFetchByUrl({
      'https://a.example.com/p': res(302, 'https://b.example.com/q'),
      'https://b.example.com/q': final,
    })
    const out = await safeFetch('https://a.example.com/p')
    expect(out.status).toBe(200)
    expect(calls).toEqual(['https://a.example.com/p', 'https://b.example.com/q'])
  })

  it('résout une Location relative contre l’URL courante puis la re-valide', async () => {
    const calls = mockFetchByUrl({
      'https://a.example.com/dir/p': res(302, '/other'),
      'https://a.example.com/other': res(200),
    })
    const out = await safeFetch('https://a.example.com/dir/p')
    expect(out.status).toBe(200)
    expect(calls[1]).toBe('https://a.example.com/other')
  })

  it('rejette au-delà du plafond de redirections', async () => {
    // Boucle infinie publique → doit s’arrêter à maxRedirects.
    mockFetchByUrl({
      'https://loop.example.com/': res(302, 'https://loop.example.com/'),
    })
    await expect(
      safeFetch('https://loop.example.com/', {}, { maxRedirects: 3 }),
    ).rejects.toThrow(/too_many_redirects/)
  })

  it('refuse d’emblée une URL initiale interne', async () => {
    mockFetchByUrl({})
    await expect(safeFetch('http://127.0.0.1/')).rejects.toBeInstanceOf(SsrfBlockedError)
  })

  it('renvoie directement une 200 sans redirection', async () => {
    mockFetchByUrl({ 'https://ok.example.com/': res(200) })
    const out = await safeFetch('https://ok.example.com/')
    expect(out.status).toBe(200)
  })
})
