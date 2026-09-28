/**
 * Lecture du catalogue SANS compte, pour l'étape « Ton premier scan ».
 *
 * L'Edge Function `product-by-barcode` et l'analyseur exigent une session :
 * avant l'inscription, on lit donc directement ce que la clé publique autorise
 * (vérifié le 28/09/2026) :
 *   - la table `cosme_check.catalog` (lecture) ;
 *   - la RPC `cosme_check_search_catalog` (recherche texte indexée) ;
 *   - la RPC `cosme_check_match_inci_batch` (couleur et familles par ingrédient).
 *
 * Tout échec renvoie `null` / `[]` : l'écran propose alors une autre voie
 * (chercher par nom, produits populaires), il ne plante jamais.
 */

import { db, supabase } from '@/lib/supabase/client'
import { parseInciList } from '@/lib/inci/parser'
import type { ScannedProduct } from '@/lib/onboarding/draft'
import type { MatchedIngredient } from '@/lib/onboarding/verdict'

interface CatalogRow {
  ean: string | null
  brand: string | null
  name: string | null
  image_url: string | null
  ingredients_text: string | null
  score: number | null
  score_label: string | null
}

const COLUMNS = 'ean, brand, name, image_url, ingredients_text, score, score_label'

/** Requêtes PostgREST non typées (la table n'est pas dans `Database`). */
interface CatalogQuery {
  select: (cols: string) => CatalogQuery
  eq: (col: string, val: unknown) => CatalogQuery
  in: (col: string, vals: unknown[]) => CatalogQuery
  not: (col: string, op: string, val: unknown) => CatalogQuery
  limit: (n: number) => CatalogQuery
  then: PromiseLike<{ data: unknown; error: unknown }>['then']
}

function catalog(): CatalogQuery {
  return db().from('catalog' as never) as unknown as CatalogQuery
}

export function toScannedProduct(row: CatalogRow): ScannedProduct | null {
  const inci = row.ingredients_text?.trim()
  const name = row.name?.trim()
  if (!inci || !name) return null
  return {
    ean: row.ean ?? null,
    brand: row.brand?.trim() || null,
    name,
    imageUrl: row.image_url ?? null,
    ingredientsText: inci,
    score: typeof row.score === 'number' ? row.score : null,
    scoreLabel: row.score_label ?? null,
  }
}

/** Même garde que le serveur : on rejette tout ce qui n'est pas un EAN/UPC. */
export const BARCODE_RE = /^\d{8,14}$/

export async function fetchProductByEan(ean: string): Promise<ScannedProduct | null> {
  if (!BARCODE_RE.test(ean)) return null
  try {
    const { data, error } = await catalog().select(COLUMNS).eq('ean', ean).limit(1)
    if (error || !Array.isArray(data) || data.length === 0) return null
    return toScannedProduct(data[0] as CatalogRow)
  } catch {
    return null
  }
}

export async function searchProducts(query: string, limit = 12): Promise<ScannedProduct[]> {
  const q = query.trim()
  if (q.length < 2) return []
  try {
    const { data, error } = await supabase.rpc(
      'cosme_check_search_catalog' as never,
      { p_query: q, p_limit: limit, p_offset: 0 } as never,
    )
    if (error || !Array.isArray(data)) return []
    return (data as CatalogRow[])
      .map(toScannedProduct)
      .filter((p): p is ScannedProduct => p !== null)
  } catch {
    return []
  }
}

/**
 * Produits très répandus, pour « Je n'ai rien sous la main ».
 *
 * Une seule requête indexée par code-barres (~0,1 s), vérifiée le 28/09/2026 :
 * six recherches texte en parallèle échouaient sur base froide (délai maximal
 * du rôle anonyme dépassé), l'écran n'affichait alors qu'un produit sur six.
 * Si la liste vieillit (produit retiré du catalogue), on complète par une
 * recherche texte, une requête à la fois.
 */
export const POPULAR_EANS = [
  '4005900701060', // Nivea, crème de jour peaux sensibles
  '3337875735742', // La Roche-Posay, Cicaplast B5 spray
  '3600542215244', // Garnier Bio, eau micellaire bleuet
  '8710908657467', // Dove, gel douche
  '3600550668933', // Mixa, lait corps peaux sèches
  '0000030159839', // CeraVe, crème lavante hydratante
]

const POPULAR_FALLBACK_QUERIES = ['nivea creme', 'garnier eau micellaire', 'dove gel douche']

export async function fetchPopularProducts(max = 6): Promise<ScannedProduct[]> {
  const out: ScannedProduct[] = []
  try {
    const { data, error } = await catalog().select(COLUMNS).in('ean', POPULAR_EANS)
    if (!error && Array.isArray(data)) {
      const byEan = new Map((data as CatalogRow[]).map((r) => [r.ean, r]))
      for (const ean of POPULAR_EANS) {
        const row = byEan.get(ean)
        const p = row ? toScannedProduct(row) : null
        if (p) out.push(p)
      }
    }
  } catch {
    // on complète ci-dessous
  }
  for (const q of POPULAR_FALLBACK_QUERIES) {
    if (out.length >= 3) break
    const list = await searchProducts(q, 5)
    const pick = list.find((p) => p.imageUrl) ?? list[0]
    if (pick && !out.some((o) => o.ean === pick.ean)) out.push(pick)
  }
  return out.slice(0, max)
}

/**
 * Découpe l'INCI puis récupère couleur et familles de chaque ingrédient.
 *
 * `ok: false` quand la lecture a échoué (réseau, délai du rôle anonyme) : le
 * verdict ne doit alors RIEN conclure, surtout pas « rien à signaler ».
 */
export async function matchIngredients(
  ingredientsText: string,
): Promise<{ matches: MatchedIngredient[]; count: number; ok: boolean }> {
  const tokens = parseInciList(ingredientsText)
  if (tokens.length === 0) return { matches: [], count: 0, ok: false }
  try {
    const { data, error } = await supabase.rpc(
      'cosme_check_match_inci_batch' as never,
      { p_tokens: tokens.map((t) => t.normalized) } as never,
    )
    if (error || !Array.isArray(data)) return { matches: [], count: tokens.length, ok: false }
    const rows = (data as MatchedIngredient[]).filter(
      (r) => r && r.match_kind !== 'none' && r.match_kind !== 'suggestion',
    )
    return { matches: rows, count: tokens.length, ok: true }
  } catch {
    return { matches: [], count: tokens.length, ok: false }
  }
}

export interface IngredientSuggestion {
  slug: string
  /** Nom INCI (« LAVANDULA ANGUSTIFOLIA OIL »). */
  name: string
  /** Nom courant en français quand la base l'a (« Huile essentielle de lavande »). */
  fr: string | null
}

/**
 * Suggestions d'ingrédients pendant la saisie de « + Autre » (écran des
 * ingrédients à éviter). Même RPC que l'écran « Mes restrictions »
 * (`cosme_check_search`), lisible sans compte, qui cherche aussi dans les noms
 * français : « lavande » trouve les huiles de lavande.
 */
export async function searchIngredients(query: string, limit = 6): Promise<IngredientSuggestion[]> {
  const q = query.trim()
  if (q.length < 2) return []
  try {
    const { data, error } = await supabase.rpc(
      'cosme_check_search' as never,
      { q, result_limit: limit } as never,
    )
    if (error || !Array.isArray(data)) return []
    return (data as { slug?: unknown; name?: unknown; translation_fr?: unknown }[])
      .filter((r) => typeof r.slug === 'string' && typeof r.name === 'string')
      .map((r) => ({
        slug: r.slug as string,
        name: r.name as string,
        fr: typeof r.translation_fr === 'string' && r.translation_fr.trim() ? r.translation_fr.trim() : null,
      }))
  } catch {
    return []
  }
}
