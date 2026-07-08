/**
 * Classifieur de bucket produit : « routine » (soin visage, matin/soir, lié au
 * score de peau) vs « staple » (produit du quotidien : déo, dentifrice, gel
 * douche, parfum, vernis...).
 *
 * Sert à PROPOSER par défaut le bon bucket à l'ajout (le choix reste explicite
 * côté utilisateur) et à refléter la logique du backfill SQL. Pur, zéro
 * dépendance, testable.
 *
 * Heuristique NOM d'abord (fiable) car l'enum analyses.category est grossier
 * (ex. un dentifrice classé « nettoyant_visage »).
 */

export type ProductKind = 'routine' | 'staple'

const COMBINING = new RegExp('[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + ']', 'g')

function norm(v: string): string {
  return v.toLowerCase().normalize('NFD').replace(COMBINING, '')
}

// Motifs de produits « du quotidien » (hygiène, hors soin visage ciblé).
const STAPLE_NAME_RE =
  /(dentifrice|toothpaste|deodorant|anti-transpirant|anti transpirant|gel douche|gel-douche|savon|shampo|apres-shampo|apres shampo|conditioner|parfum|eau de toilette|eau de parfum|cologne|vernis|rasage|rasoir|mousse a raser|nettoyant intime|coiffant|laque)/

// Catégories enum clairement « staple ».
const STAPLE_CATEGORIES = new Set(['deodorant', 'parfum', 'shampooing', 'apres_shampooing'])

/**
 * Bucket suggéré pour un produit. Le nom prime (plus fiable), la catégorie enum
 * sert de filet. Par défaut « routine » (soin).
 */
export function classifyProductKind(
  name: string | null | undefined,
  category?: string | null,
): ProductKind {
  const n = norm(name ?? '')
  if (n && STAPLE_NAME_RE.test(n)) return 'staple'
  if (category && STAPLE_CATEGORIES.has(category)) return 'staple'
  return 'routine'
}
