/**
 * product-by-barcode — garde-fou "catalog-only mode".
 *
 * Cette Edge Function a été volontairement passée en mode catalog-only
 * (zéro appel externe) : le code-barres est résolu UNIQUEMENT depuis le
 * catalog Cosme Check, jamais via OpenBeautyFacts / internet. Ce test garde
 * cette invariante (et vérifie que l'ancien flag `ENABLE_INTERNET_FALLBACK`
 * ne réapparaît pas par mégarde).
 */
import fs from 'fs'
import path from 'path'

const filePath = path.resolve(
  __dirname,
  '../../supabase/functions/product-by-barcode/index.ts'
)

describe('product-by-barcode — catalog-only mode', () => {
  let code: string

  beforeAll(() => {
    code = fs.readFileSync(filePath, 'utf8')
  })

  it("ne réintroduit pas l'ancien fallback internet (flag supprimé)", () => {
    expect(code).not.toContain('ENABLE_INTERNET_FALLBACK')
    expect(code).not.toContain('catalog_miss')
  })

  it('résout le code-barres depuis le catalog (source: "catalog")', () => {
    expect(code).toContain('getCatalogByEan')
    expect(code).toContain('source: "catalog"')
  })

  it('ne consomme aucun crédit (costCredits: 0)', () => {
    expect(code).toContain('costCredits: 0')
  })

  it('valide le format du code-barres (EAN-8..ITF-14)', () => {
    expect(code).toContain('BARCODE_RE')
    expect(code).toContain('/^\\d{8,14}$/')
  })

  it('gère EAN connu sans INCI (incomplete) et EAN inconnu (registered)', () => {
    expect(code).toContain('reason: "incomplete"')
    expect(code).toContain('reason: "registered"')
  })

  it('cache les scans répétés (KV TTL 12h)', () => {
    expect(code).toContain('getCachedBarcodeResult')
    expect(code).toContain('cacheBarcodeResult')
  })
})
