/**
 * Filtre GROSSIER de la liste « Routine produit » : Visage / Corps / Cheveux
 * (+ Autres pour dentifrice, ongles, hygiène intime…).
 *
 * La zone vient du MÊME résolveur que le score de compatibilité et les 3 blocs
 * IA (`supabase/functions/personal-insights/productContext.ts`, pur, sans
 * réseau), nourri avec les mêmes champs que l'Edge Function `personal-insights`
 * (catégorie catalogue, nom, type, catégorie précise, INCI). Un produit peut
 * tomber dans plusieurs zones (ex. crème « visage et corps »).
 */
import {
  resolveProductContext,
  zonesOf,
  type ProductAxis,
} from '../../supabase/functions/personal-insights/productContext'

export type RoutineZone = 'visage' | 'corps' | 'cheveux' | 'autres'

export const ROUTINE_ZONE_ORDER: readonly RoutineZone[] = ['visage', 'corps', 'cheveux', 'autres']

export const ROUTINE_ZONE_LABEL: Record<RoutineZone, string> = {
  visage: 'Visage',
  corps: 'Corps',
  cheveux: 'Cheveux',
  autres: 'Autres',
}

const AXIS_TO_ZONE: Record<ProductAxis, RoutineZone> = {
  face: 'visage',
  eyes: 'visage',
  lips: 'visage',
  body: 'corps',
  hands: 'corps',
  feet: 'corps',
  underarm: 'corps',
  hair: 'cheveux',
  oral: 'autres',
  nails: 'autres',
  none: 'autres',
}

/** Champs de l'analyse jointe utiles à la zone (sous-ensemble de RoutineJoinedAnalysis). */
export interface ZoneSource {
  name?: string | null
  product_label?: string | null
  category?: string | null
  category_precise?: string | null
  product_type?: string | null
  result_json?: unknown
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null)

/** Zones grossières d'un produit (jamais vide : à défaut, « autres »). */
export function routineZonesOf(a: ZoneSource | null | undefined): RoutineZone[] {
  if (!a) return ['autres']
  const rj = (a.result_json && typeof a.result_json === 'object' ? a.result_json : {}) as {
    catalogCategory?: unknown
    category?: unknown
    productType?: unknown
    items?: unknown
  }
  const items = Array.isArray(rj.items)
    ? rj.items.map((i: { name?: unknown; input?: unknown } | null) => ({
        name: str(i?.name),
        input: str(i?.input),
      }))
    : undefined
  const ctx = resolveProductContext({
    catalogCategory: str(rj.catalogCategory),
    categories: [str(rj.category), a.category ?? null],
    // `||` : une chaîne vide retombe sur le champ suivant (comme l'Edge Function).
    productType: str(rj.productType) || str(a.product_type),
    categoryPrecise: a.category_precise ?? null,
    productName: str(a.product_label) || str(a.name),
    items,
  })
  const zones = [...new Set(zonesOf(ctx).map((z) => AXIS_TO_ZONE[z] ?? 'autres'))]
  return zones.length > 0 ? zones : ['autres']
}

/** Zones présentes dans une liste, dans l'ordre d'affichage des filtres. */
export function presentZones(zonesPerItem: readonly (readonly RoutineZone[])[]): RoutineZone[] {
  const seen = new Set(zonesPerItem.flat())
  return ROUTINE_ZONE_ORDER.filter((z) => seen.has(z))
}
