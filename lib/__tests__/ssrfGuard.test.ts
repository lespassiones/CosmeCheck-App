/**
 * ssrfGuard — défense SSRF partagée (edge functions). Test pur (node).
 */
import {
  validateUserUrl,
  isSafePublicUrl,
} from '../../supabase/functions/_shared/ssrfGuard'

describe('validateUserUrl — accepte les URLs publiques http(s)', () => {
  it.each([
    'https://www.sephora.fr/p/produit',
    'http://example.com',
    'https://incidecoder.com/products/x',
  ])('accepte %s', (u) => {
    expect(validateUserUrl(u).ok).toBe(true)
  })
})

describe('validateUserUrl — refuse les cibles dangereuses (SSRF)', () => {
  it.each([
    ['vide', ''],
    ['schéma non http', 'ftp://example.com'],
    ['javascript', 'javascript:alert(1)'],
    ['identifiants', 'https://user:pass@example.com'],
    ['localhost', 'http://localhost:3000'],
    ['loopback v4', 'http://127.0.0.1'],
    ['0.0.0.0', 'http://0.0.0.0'],
    ['RFC1918 10/8', 'http://10.0.0.5'],
    ['RFC1918 192.168', 'http://192.168.1.1'],
    ['RFC1918 172.16', 'http://172.16.0.1'],
    ['172.31 (haut de plage)', 'http://172.31.255.255'],
    ['link-local 169.254', 'http://169.254.169.254'],
    ['CGNAT 100.64', 'http://100.64.0.1'],
    ['multicast 224', 'http://224.0.0.1'],
    ['metadata cloud', 'http://metadata.google.internal/x'],
    ['.internal', 'https://db.internal'],
    ['.localhost', 'https://app.localhost'],
    ['IPv6 loopback', 'http://[::1]'],
    ['IPv6 ULA fd', 'http://[fd00::1]'],
    ['URL invalide', 'pas une url'],
  ])('refuse %s', (_label, u) => {
    expect(validateUserUrl(u).ok).toBe(false)
  })

  it('172.32 (hors plage privée) est accepté', () => {
    expect(validateUserUrl('http://172.32.0.1').ok).toBe(true)
  })

  it('isSafePublicUrl est cohérent avec validateUserUrl', () => {
    expect(isSafePublicUrl('https://example.com')).toBe(true)
    expect(isSafePublicUrl('http://127.0.0.1')).toBe(false)
  })
})
