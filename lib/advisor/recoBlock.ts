/**
 * Bloc de recommandation émis par l'advisor en fin de réponse.
 *
 * Quand le Beauty Advisor veut proposer des produits, il termine son message par
 * un bloc technique (invisible pour l'utilisateur) :
 *
 *   <<<RECO>>>
 *   {"ingredients": ["niacinamide", "panthenol"], "form": "serum"}
 *   <<<END>>>
 *
 * Ces helpers (purs, testés) servent côté client à :
 *   - retirer le bloc du texte affiché (`stripRecoBlock`), y compris pendant le
 *     streaming où le bloc peut être encore partiel,
 *   - extraire les critères de recherche (`parseRecoBlock`).
 */
export interface RecoCriteria {
  ingredients: string[]
  form: string | null
}

const RECO_MARKER = '<<<RECO'

/**
 * Retire le bloc RECO (et tout ce qui suit son ouverture) du texte affiché.
 * Gère aussi le cas streaming où seul un PRÉFIXE du marqueur est arrivé en fin
 * de buffer (ex. « ...<<<RE »), pour ne jamais laisser fuiter de marqueur.
 */
export function stripRecoBlock(text: string): string {
  const i = text.indexOf(RECO_MARKER)
  if (i !== -1) return text.slice(0, i).trimEnd()
  // Marqueur partiel en toute fin de texte (streaming en cours).
  for (let k = RECO_MARKER.length - 1; k > 0; k--) {
    if (text.endsWith(RECO_MARKER.slice(0, k))) {
      return text.slice(0, text.length - k).trimEnd()
    }
  }
  return text
}

/** Extrait les critères du bloc RECO complet, ou null si absent / invalide. */
export function parseRecoBlock(text: string): RecoCriteria | null {
  const m = text.match(/<<<RECO>>>\s*([\s\S]*?)\s*<<<END>>>/)
  if (!m) return null
  let obj: unknown
  try {
    obj = JSON.parse(m[1])
  } catch {
    return null
  }
  if (!obj || typeof obj !== 'object') return null
  const o = obj as Record<string, unknown>
  const ingredients = Array.isArray(o.ingredients)
    ? o.ingredients
        .filter((x): x is string => typeof x === 'string' && x.trim().length >= 2)
        .map((x) => x.trim())
        .slice(0, 4)
    : []
  if (ingredients.length === 0) return null
  const formRaw = typeof o.form === 'string' ? o.form.trim() : ''
  // Tolère le cas où l'IA met la chaîne "null"/"none" au lieu du JSON null.
  const form =
    formRaw.length > 0 && !['null', 'none', 'aucun', 'undefined'].includes(formRaw.toLowerCase())
      ? formRaw
      : null
  return { ingredients, form }
}
