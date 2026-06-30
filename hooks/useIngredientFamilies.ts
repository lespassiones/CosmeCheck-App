/**
 * useIngredientFamilies — charge le référentiel `cosme_check.ingredient_families`
 * (slug, tag_slug, name) une fois et le cache 1 h. Sert au matching de
 * restrictions par TAG (parité exacte avec le web et le backend analyser).
 */
import { useQuery } from '@tanstack/react-query'

import { db } from '@/lib/supabase/client'
import type { IngredientFamily } from '@/lib/restrictions/check'

interface FamiliesQuery {
  select: (cols: string) => {
    eq: (col: string, val: unknown) => {
      order: (col: string, opts: { ascending: boolean }) => Promise<{
        data: { slug: string; tag_slug: string | null; name: string }[] | null
        error: unknown
      }>
    }
  }
}

const HOUR = 60 * 60 * 1000

async function fetchIngredientFamilies(): Promise<IngredientFamily[]> {
  // `ingredient_families` n'est pas typée dans Database → cast explicite.
  const { data, error } = await (
    db().from('ingredient_families' as never) as unknown as FamiliesQuery
  )
    .select('slug, tag_slug, name')
    .eq('active', true)
    .order('sort_order', { ascending: true })
  if (error || !data) return []
  return data.map((r) => ({ slug: r.slug, tagSlug: r.tag_slug, name: r.name }))
}

export function useIngredientFamilies() {
  return useQuery({
    queryKey: ['ingredient-families'],
    staleTime: HOUR,
    gcTime: HOUR,
    queryFn: fetchIngredientFamilies,
  })
}
