/**
 * groupRestrictionMatches : une ligne par restriction présente dans la feuille
 * « N de tes restrictions ». Le nombre de lignes DOIT égaler le compteur
 * « Contient N de tes restrictions » (familles uniques + ingrédients uniques).
 */
import { checkRestrictions, type IngredientFamily } from '@/lib/restrictions/check'
import { groupRestrictionMatches } from '@/lib/restrictions/group'
import type { UserRestrictions } from '@/lib/supabase/types'

const FAMILIES: IngredientFamily[] = [
  { slug: 'parfums-synthese', tagSlug: 'parfum', name: 'Parfums de synthèse' },
  { slug: 'allergenes-parfumants', tagSlug: 'allergene', name: 'Allergènes parfumants' },
  { slug: 'silicones', tagSlug: 'silicone', name: 'Silicones' },
]

const ITEMS = [
  { position: 1, name: 'AQUA', slug: 'aqua', tags: [] },
  { position: 2, name: 'PARFUM', slug: 'parfum', tags: ['parfum'] },
  { position: 3, name: 'LINALOOL', slug: 'linalool', tags: ['allergene'] },
  { position: 4, name: 'PHENOXYETHANOL', slug: 'phenoxyethanol', tags: [] },
  { position: 5, name: 'LIMONENE', slug: 'limonene', tags: ['allergene'] },
  { position: 6, name: 'Linalool', slug: null, tags: ['allergene'] },
]

const RESTRICTIONS: UserRestrictions = {
  families: ['allergenes-parfumants', 'parfums-synthese', 'silicones'],
  ingredients: [{ slug: 'phenoxyethanol', name: 'Phenoxyethanol' }],
}

describe('groupRestrictionMatches', () => {
  const matches = checkRestrictions(ITEMS, RESTRICTIONS, FAMILIES)
  const groups = groupRestrictionMatches(matches, ITEMS)

  it('une ligne par restriction présente, familles triées puis ingrédients', () => {
    expect(groups.map((g) => g.label)).toEqual([
      'Allergènes parfumants',
      'Parfums de synthèse',
      'Phenoxyethanol',
    ])
    expect(groups.map((g) => g.kind)).toEqual(['family', 'family', 'ingredient'])
  })

  it('le nombre de lignes égale le compteur familles + ingrédients uniques', () => {
    const fam = new Set(matches.filter((m) => m.kind === 'family').map((m) => m.slug))
    const ing = new Set(matches.filter((m) => m.kind === 'ingredient').map((m) => m.slug))
    expect(groups).toHaveLength(fam.size + ing.size)
  })

  it('liste les ingrédients concernés dans l’ordre de la formule, sans doublon, avec leur slug', () => {
    const allergens = groups[0]
    expect(allergens.ingredients).toEqual([
      { position: 3, name: 'LINALOOL', slug: 'linalool' },
      { position: 5, name: 'LIMONENE', slug: 'limonene' },
    ])
    expect(groups[1].ingredients).toEqual([{ position: 2, name: 'PARFUM', slug: 'parfum' }])
  })

  it('aucune restriction présente → aucune ligne', () => {
    expect(groupRestrictionMatches([], ITEMS)).toEqual([])
  })
})
