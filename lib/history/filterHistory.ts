/**
 * Filtre pur de l'historique : recherche texte (tokens) + bascule « favoris ».
 * Extrait pour testabilité Jest (logique sans React).
 */
export function filterHistory<T extends { searchTokens: string[]; favori: boolean }>(
  items: T[],
  search: string,
  favorisOnly: boolean,
): T[] {
  const q = search.trim().toLowerCase()
  return items.filter((it) => {
    if (favorisOnly && !it.favori) return false
    if (q && !it.searchTokens.some((t) => t.includes(q))) return false
    return true
  })
}
