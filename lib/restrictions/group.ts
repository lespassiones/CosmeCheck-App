/**
 * groupRestrictionMatches : regroupe les correspondances de checkRestrictions
 * par restriction de l'utilisateur, pour la feuille « N de tes restrictions ».
 *
 * Une ligne par famille restreinte présente (ex. « Allergènes parfumants » avec
 * Linalool et Limonene) puis une ligne par ingrédient restreint présent.
 * Le nombre de groupes est EXACTEMENT le compteur « Contient N de tes
 * restrictions » (familles uniques + ingrédients uniques, même formule que le web).
 */
import type { CheckableItem, RestrictionMatch } from './check'

export interface RestrictionGroupIngredient {
  position: number
  /** Nom INCI tel qu'il apparaît dans le produit. */
  name: string
  /** Slug de la fiche ingrédient, null si l'ingrédient n'est pas reconnu. */
  slug: string | null
}

export interface RestrictionGroup {
  key: string
  kind: 'family' | 'ingredient'
  /** Nom de la famille (référentiel) ou de l'ingrédient restreint. */
  label: string
  /** Ingrédients du produit concernés, dans l'ordre de la formule, sans doublon. */
  ingredients: RestrictionGroupIngredient[]
}

export function groupRestrictionMatches(
  matches: RestrictionMatch[],
  items: CheckableItem[],
): RestrictionGroup[] {
  const slugByPosition = new Map<number, string | null>()
  for (const it of items) slugByPosition.set(it.position, it.slug ?? null)

  const groups = new Map<string, RestrictionGroup>()
  const seenNames = new Map<string, Set<string>>()

  for (const m of [...matches].sort((a, b) => a.position - b.position)) {
    const key = `${m.kind === 'family' ? 'f' : 'i'}:${m.slug}`
    let group = groups.get(key)
    if (!group) {
      group = { key, kind: m.kind, label: m.label, ingredients: [] }
      groups.set(key, group)
      seenNames.set(key, new Set())
    }
    const name = m.inciName.trim()
    const dedupe = name.toLowerCase()
    const seen = seenNames.get(key)!
    if (!name || seen.has(dedupe)) continue
    seen.add(dedupe)
    group.ingredients.push({
      position: m.position,
      name,
      slug: slugByPosition.get(m.position) ?? null,
    })
  }

  const byLabel = (a: RestrictionGroup, b: RestrictionGroup) =>
    a.label.localeCompare(b.label, 'fr', { sensitivity: 'base' })
  const all = [...groups.values()]
  return [
    ...all.filter((g) => g.kind === 'family').sort(byLabel),
    ...all.filter((g) => g.kind === 'ingredient').sort(byLabel),
  ]
}
