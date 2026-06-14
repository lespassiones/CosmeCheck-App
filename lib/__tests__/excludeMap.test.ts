/**
 * excludeMap — traduction des contraintes ad-hoc du message en exclusions RPC.
 */
import { resolveExclusion, resolveExclusions } from '@/lib/advisor/excludeMap'

describe('resolveExclusion', () => {
  it('mappe parfum (+ synonyme fragrance, + préfixe "sans")', () => {
    expect(resolveExclusion('parfum')?.families).toContain('allergene-parfumant')
    expect(resolveExclusion('fragrance')?.ingredients).toContain('fragrance')
    expect(resolveExclusion('sans parfum')?.label).toBe('sans parfum')
  })

  it('alcool -> tokens desséchants, PAS de famille (évite les alcools gras)', () => {
    const a = resolveExclusion('alcool')
    expect(a?.ingredients).toContain('alcohol denat.')
    expect(a?.ingredients).toContain('ethanol')
    expect(a?.families).toEqual([])
    // un alcool gras ne doit jamais figurer dans la liste à bannir
    expect(a?.ingredients).not.toContain('cetyl alcohol')
  })

  it('familles directes : silicone, huile essentielle, sulfate', () => {
    expect(resolveExclusion('silicone')?.families).toEqual(['silicone'])
    expect(resolveExclusion('huile essentielle')?.families).toEqual(['huile-essentielle'])
    expect(resolveExclusion('HE')?.families).toEqual(['huile-essentielle'])
    expect(resolveExclusion('sulfates')?.families).toEqual(['sulfate'])
  })

  it('mot-clé sensoriel/inconnu -> null', () => {
    expect(resolveExclusion('fruité')).toBeNull()
    expect(resolveExclusion('sent bon')).toBeNull()
    expect(resolveExclusion('frais')).toBeNull()
  })
})

describe('resolveExclusions', () => {
  it('fusionne familles + ingrédients + libellés, dédoublonne', () => {
    const r = resolveExclusions(['sans parfum', 'sans alcool', 'silicone'])
    expect(r.families).toEqual(expect.arrayContaining(['allergene-parfumant', 'silicone']))
    expect(r.ingredients).toEqual(expect.arrayContaining(['parfum', 'fragrance', 'ethanol']))
    expect(r.labels).toEqual(['sans parfum', 'sans alcool', 'sans silicone'])
    expect(r.unknown).toEqual([])
  })

  it('sépare les mots-clés sensoriels dans unknown (à décliner)', () => {
    const r = resolveExclusions(['parfum', 'fruité', 'odeur fraiche'])
    expect(r.labels).toEqual(['sans parfum'])
    expect(r.unknown).toEqual(['fruité', 'odeur fraiche'])
  })

  it('liste vide / null -> tout vide', () => {
    expect(resolveExclusions([])).toEqual({ families: [], ingredients: [], labels: [], unknown: [] })
    expect(resolveExclusions(null)).toEqual({ families: [], ingredients: [], labels: [], unknown: [] })
  })
})
