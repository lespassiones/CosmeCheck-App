/**
 * Titre d'un produit analysé : DEUX lectures distinctes de la même ligne.
 *
 * `analyses` porte deux libellés :
 *   - `product_label` : le nom RÉEL du produit (marque/catalogue/OCR). C'est
 *     l'IDENTITÉ : c'est lui qui sert à retrouver la ligne catalogue, l'image,
 *     les alternatives, la promesse. Il ne doit JAMAIS être remplacé par un nom
 *     personnalisé, sinon `resolveCatalogIdentity` et `routine-smart-suggest`
 *     cherchent un produit qui n'existe pas.
 *   - `name` : le nom AFFICHÉ, pré-rempli avec `product_label` à la création et
 *     que l'utilisateur peut renommer depuis l'historique. Il n'existe que dans
 *     SA ligne (RLS par `user_id`) : renommer ne change rien pour les autres.
 *
 * Bug bêta corrigé (Stela, 12 sept 2026) : l'historique affichait `name` en
 * premier mais la fiche produit affichait `product_label` en premier. On
 * renommait, la liste changeait, la fiche non → « Renommer ne marche pas ».
 *
 * Règle : `displayTitle` PARTOUT où on montre le produit à son propriétaire,
 * `catalogTitle` partout où le nom sert à retrouver le produit.
 */

export interface TitleSource {
  name?: string | null
  product_label?: string | null
}

/** Nom vu par l'utilisateur : son renommage gagne, sinon le nom réel. */
export function displayTitle(row: TitleSource, fallback = 'Analyse'): string {
  return row.name?.trim() || row.product_label?.trim() || fallback
}

/** Nom réel du produit, pour toute résolution catalogue. Jamais le renommage. */
export function catalogTitle(row: TitleSource, fallback = 'Analyse'): string {
  return row.product_label?.trim() || row.name?.trim() || fallback
}
