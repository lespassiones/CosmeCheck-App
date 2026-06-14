/**
 * restrictionsKey — clé canonique des restrictions, utilisée pour invalider une
 * synthèse périmée (générée avec d'autres restrictions). Doit être stable (ordre
 * indifférent) et identique à la version Deno de l'Edge `synthesis`.
 */
import { restrictionsKey } from '@/lib/analysis/restrictionsKey'
import type { UserRestrictions } from '@/lib/supabase/types'

const r = (families: string[], ingredients: { slug: string; name: string }[] = []): UserRestrictions =>
  ({ families, ingredients } as UserRestrictions)

describe('restrictionsKey', () => {
  it('aucune restriction -> clé vide stable', () => {
    expect(restrictionsKey(r([]))).toBe('|')
    expect(restrictionsKey(null)).toBe('|')
    expect(restrictionsKey(undefined)).toBe('|')
  })

  it('insensible à l ordre + casse', () => {
    expect(restrictionsKey(r(['Silicone', 'paraben']))).toBe(restrictionsKey(r(['paraben', 'SILICONE'])))
  })

  it('change quand on ajoute/retire une famille (cœur du fix synthèse)', () => {
    const avant = restrictionsKey(r(['huile-esterifiee']))
    const apres = restrictionsKey(r([])) // l utilisateur retire la famille
    expect(avant).not.toBe(apres)
    expect(avant).toBe('huile-esterifiee|')
    expect(apres).toBe('|')
  })

  it('inclut les ingrédients explicites (par slug)', () => {
    const k = restrictionsKey(r(['paraben'], [{ slug: 'aluminum-chlorohydrate', name: 'Aluminum Chlorohydrate' }]))
    expect(k).toBe('paraben|aluminum-chlorohydrate')
  })
})
