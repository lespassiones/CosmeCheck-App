/**
 * Filtre des alternatives produit selon les restrictions + le profil utilisateur.
 *
 * OBJECTIF : ne recommander QUE des produits qui ne contiennent AUCUN des
 * éléments que l'utilisateur évite. Tout est calculé côté client à partir de
 * `ingredients_text` (renvoyé par la RPC `cosme_check_get_alternatives`), pour
 * garder UNE seule logique de matching, pure et testable (aucune dépendance RN).
 *
 * Trois sources d'exclusion, fusionnées en un `ExclusionSet` :
 *   1. `restrictions.ingredients[].name` — ingrédients explicitement bannis (match EXACT par token INCI).
 *   2. familles → noms INCI membres (via RPC `cosme_check_get_family_ingredient_names`, match EXACT).
 *   3. `skin.allergiesFreeform` — texte libre de l'utilisateur (match SOUS-CHAÎNE).
 *
 * Le matching token-exact (1 & 2) évite les faux positifs d'un simple substring
 * (ex. "peg" qui matcherait trop large) ; le freeform reste en substring car
 * l'utilisateur tape des termes approximatifs.
 */

import type { UserRestrictions } from '@/lib/supabase/types'

/** Produit alternatif tel que renvoyé par la RPC (forme catalogue). */
export interface AlternativeProduct {
  ean: string
  brand: string | null
  name: string | null
  imageUrl: string | null
  score: number | null
  scoreLabel: string | null
  scoreTone: string | null
  countTotal: number | null
  ingredientsText: string | null
}

/** Ensemble normalisé des éléments à exclure. */
export interface ExclusionSet {
  /** Noms INCI complets à bannir (comparaison token-exact, normalisés). */
  exactNames: Set<string>
  /** Termes libres à bannir (comparaison sous-chaîne, normalisés, longueur ≥ 3). */
  substrings: string[]
}

const DIACRITICS_RE = /[̀-ͯ]/g

/** Minuscule + sans accents + espaces compactés. Base de toute comparaison. */
export function normalizeToken(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(DIACRITICS_RE, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Construit l'ensemble d'exclusion à partir des restrictions, des noms INCI de
 * familles (déjà résolus côté appelant) et des allergies en texte libre.
 */
export function buildExclusionSet(input: {
  restrictions: UserRestrictions
  familyIngredientNames: string[]
  allergiesFreeform?: string | null
}): ExclusionSet {
  const exactNames = new Set<string>()

  for (const ing of input.restrictions.ingredients) {
    const n = normalizeToken(ing.name ?? '')
    if (n) exactNames.add(n)
  }
  for (const name of input.familyIngredientNames) {
    const n = normalizeToken(name ?? '')
    if (n) exactNames.add(n)
  }

  const substrings: string[] = []
  if (input.allergiesFreeform) {
    for (const part of input.allergiesFreeform.split(/[,;\n]/)) {
      const n = normalizeToken(part)
      // ≥ 3 caractères : évite que "ph", "fa"… bannissent tout.
      if (n.length >= 3) substrings.push(n)
    }
  }

  return { exactNames, substrings }
}

/** True si l'ensemble n'exclut rien (aucune restriction → tout passe). */
export function isExclusionEmpty(ex: ExclusionSet): boolean {
  return ex.exactNames.size === 0 && ex.substrings.length === 0
}

/**
 * True si le produit contient au moins un élément exclu.
 * - tokens INCI (séparés par virgule) vs `exactNames`
 * - texte complet vs `substrings`
 */
export function productMatchesExclusion(
  ingredientsText: string | null | undefined,
  ex: ExclusionSet,
): boolean {
  if (!ingredientsText) return false
  if (isExclusionEmpty(ex)) return false

  const normalizedFull = normalizeToken(ingredientsText)

  if (ex.substrings.length > 0) {
    for (const sub of ex.substrings) {
      if (normalizedFull.includes(sub)) return true
    }
  }

  if (ex.exactNames.size > 0) {
    // INCI listé par virgules ; on tolère aussi les points-virgules.
    for (const rawToken of ingredientsText.split(/[,;]/)) {
      const tok = normalizeToken(rawToken)
      if (tok && ex.exactNames.has(tok)) return true
    }
  }

  return false
}

/**
 * Garde uniquement les produits qui ne contiennent AUCUN élément exclu.
 * L'ordre d'entrée (déjà trié par score décroissant côté RPC) est préservé.
 */
export function filterAlternatives(
  candidates: AlternativeProduct[],
  ex: ExclusionSet,
): AlternativeProduct[] {
  if (isExclusionEmpty(ex)) return candidates
  return candidates.filter((c) => !productMatchesExclusion(c.ingredientsText, ex))
}
