/**
 * Utilitaires purs des notifications (zéro API native).
 *
 * QUOI : la clé de dédoublonnage des alertes conflit de routine.
 *
 * NOTE : la planification du « bilan peau hebdo » (computeNextBilanTrigger,
 * isoWeekdayToExpo) a été retirée avec la fonctionnalité Score de peau
 * (juillet 2026). Ce module ne conserve que la logique encore utilisée.
 */

/** Nom normalisé pour la dédup : minuscules, accents retirés, espaces réduits. */
function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

/**
 * Clé de dédoublonnage SYMÉTRIQUE d'une alerte conflit : les deux noms
 * normalisés triés + la clé de semaine. (A, B) et (B, A) donnent la même clé ;
 * une semaine différente redonne droit à une alerte.
 */
export function conflictDedupKey(nameA: string, nameB: string, weekKey: string): string {
  const [first, second] = [normalizeName(nameA), normalizeName(nameB)].sort()
  return `${weekKey}|${first}|${second}`
}
