/**
 * Listes qui affichent des analyses, à marquer périmées quand une analyse est
 * créée, renommée ou supprimée.
 *
 * POURQUOI : les onglets restent montés et `refetchOnWindowFocus` est coupé.
 * Seul le tableau de bord était rafraîchi après une analyse : l'Historique ne
 * montrait pas le nouveau produit, et après une suppression la tuile « Dernière
 * analyse », les Favoris ou la Routine gardaient un produit disparu.
 * Une liste sans observateur est seulement marquée périmée (rechargée à sa
 * prochaine ouverture) ; une liste d'un onglet monté (Historique, Accueil) est
 * relue tout de suite, une requête chacune.
 */
import type { QueryClient } from '@tanstack/react-query'

export const ANALYSIS_LIST_ROOT_KEYS = [
  'history',
  'dashboard',
  'favorites',
  'has-analyses',
  'routine-eligible-analyses',
] as const

export function invalidateAnalysisLists(
  queryClient: QueryClient,
  opts: { routine?: boolean } = {},
): void {
  for (const key of ANALYSIS_LIST_ROOT_KEYS) {
    void queryClient.invalidateQueries({ queryKey: [key] })
  }
  // Suppression : la routine peut référencer l'analyse retirée.
  if (opts.routine) void queryClient.invalidateQueries({ queryKey: ['routine'] })
}
