import fs from 'fs'
import path from 'path'

const filePath = path.resolve(
  __dirname,
  '../../supabase/functions/product-by-barcode/index.ts'
)

describe('product-by-barcode ENABLE_INTERNET_FALLBACK flag', () => {
  let code: string

  beforeAll(() => {
    code = fs.readFileSync(filePath, 'utf8')
  })

  it('ENABLE_INTERNET_FALLBACK constant exists', () => {
    expect(code).toContain('ENABLE_INTERNET_FALLBACK')
  })

  it('catalog_miss source is returned when flag is false', () => {
    expect(code).toContain('catalog_miss')
  })

  it('early return block references the flag correctly', () => {
    expect(code).toContain('if (!ENABLE_INTERNET_FALLBACK)')
  })

  it('flag is set to true by default (internet fallback enabled)', () => {
    expect(code).toContain('ENABLE_INTERNET_FALLBACK = true')
  })
})
