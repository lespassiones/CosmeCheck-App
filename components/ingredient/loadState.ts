/**
 * Pure — dérive l'état UI de l'écran fiche ingrédient à partir des résultats
 * react-query. Extrait pour être testable en env node, sans monter RN.
 */

import type { IngredientDetail, IngredientProductHit } from './types'

export type IngredientLoadState =
  | { status: 'loading' }
  | { status: 'notfound' }
  | { status: 'ready'; ing: IngredientDetail; products: IngredientProductHit[] }

/** TTL fiche INCI — très stable. */
export const INGREDIENT_STALE_MS = 24 * 60 * 60 * 1000 // 24h
/** TTL liste produits — peut bouger avec les nouveaux scans. */
export const PRODUCTS_STALE_MS = 60 * 60 * 1000 // 1h

export function deriveIngredientLoadState(
  slug: string | undefined,
  ingLoading: boolean,
  ing: IngredientDetail | null,
  products: IngredientProductHit[] | undefined,
): IngredientLoadState {
  if (!slug) return { status: 'notfound' }
  if (ingLoading) return { status: 'loading' }
  if (!ing) return { status: 'notfound' }
  return { status: 'ready', ing, products: products ?? [] }
}
