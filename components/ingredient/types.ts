/**
 * Types pour l'écran fiche ingrédient — miroir des types web
 * (CosmetWiki lib/supabase.ts : Ingredient, ProductHit) tels que renvoyés par
 * les RPC `cosme_check_get_ingredient` et `cosme_check_products_for_ingredient`.
 *
 * NB : la couleur renvoyée par l'API est CAPITALISÉE ('Vert'…), on la normalise
 * via `normalizeColor()` (@/lib/analysis/types) côté écran.
 */

import type { DbColorRating } from '@/lib/analysis/types'

export type IngredientFunction = {
  name: string
  description?: string | null
}

export type IngredientDetail = {
  id: number
  inci_id: number
  slug: string
  name: string
  cas_number: string | null
  einecs_number: string | null
  classification: string[] | null
  color_rating: DbColorRating
  origin: string | null
  description: string | null
  functions: IngredientFunction[] | null
  prevalence_pct: number | null
  category_breakdown: Record<string, number> | null
  regulated_zones: string[] | null
  translations: Record<string, string> | null
  source_url: string
  details_scraped: boolean
}

export type IngredientProductHit = {
  product_id: number
  brand: string
  name: string
  volume: string | null
  score: number | null
  image_url: string | null
  source_url: string | null
  ingredient_position: number | null
}
