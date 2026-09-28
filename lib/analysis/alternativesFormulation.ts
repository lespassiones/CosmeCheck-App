/**
 * alternativesFormulation : filtre AVEC REPLI des alternatives selon la forme
 * galénique (lib/inci/formulation.ts), logique pure partagée par le carrousel
 * « Alternatives » et la page « Voir tout » (hooks/useAlternatives.ts).
 *
 * Décision produit (retour bêta sept 2026, « pour une crème dont le premier
 * ingrédient est l'eau, l'alternative doit être une crème dont le premier
 * ingrédient est l'eau ») :
 *   - on propose d'abord le MÊME type de formule (`same`) ;
 *   - s'il n'y en a pas assez, on complète avec un type VOISIN (aqueux et
 *     émulsion ; huile et baume) ou INCONNU (fail-open : INCI illisible) ;
 *   - JAMAIS un type opposé (pas de savon solide pour un gel douche, pas
 *     d'huile pour une crème) : ces candidats sont écartés.
 * Source de type inconnu : tout passe en `fallback` (aucun filtre, ordre inchangé).
 */
import {
  affinityRank,
  formulationAffinity,
  type Galenic,
} from '@/lib/inci/formulation'
import { orderByTierShuffled } from '@/lib/analysis/tierShuffle'

export interface FormulationGroups<T> {
  /** Même forme que la source : affichés en premier. */
  same: T[]
  /** Forme voisine ou inconnue : complètent quand `same` ne suffit pas. */
  fallback: T[]
  /** Forme opposée : jamais proposés. */
  excluded: T[]
}

/** Répartit les candidats selon l'affinité de leur formule avec celle de la source. */
export function groupByFormulation<T>(
  items: readonly T[],
  source: Galenic,
  galenicOf: (item: T) => Galenic,
): FormulationGroups<T> {
  const groups: FormulationGroups<T> = { same: [], fallback: [], excluded: [] }
  for (const item of items) {
    const rank = affinityRank(formulationAffinity(source, galenicOf(item)))
    if (rank === 0) groups.same.push(item)
    else if (rank === 1) groups.fallback.push(item)
    else groups.excluded.push(item)
  }
  return groups
}

/**
 * Ordre d'affichage : `same` puis `fallback`. À l'intérieur de CHAQUE groupe :
 * mélange par tier de pastille (graine fournie, cf. tierShuffle) ou tri par
 * score plafonné décroissant (sans graine). Le groupe d'affinité prime donc
 * toujours sur la note : une crème eau-première bien notée passe avant une huile
 * mieux notée pour une crème source (l'huile étant de toute façon écartée).
 */
export function orderFormulationGroups<T>(
  groups: Pick<FormulationGroups<T>, 'same' | 'fallback'>,
  scoreOf: (item: T) => number,
  seed?: string | null,
): T[] {
  const order = (list: T[]): T[] =>
    seed ? orderByTierShuffled(list, seed, scoreOf) : list.slice().sort((a, b) => scoreOf(b) - scoreOf(a))
  return [...order(groups.same), ...order(groups.fallback)]
}

/**
 * Faut-il récupérer une page de candidats de plus ? On compte APRÈS le filtre de
 * formule (sinon la boucle s'arrête trop tôt et laisse le carrousel vide) :
 *   - le vivier utilisable (same + fallback) doit atteindre `poolTarget` ;
 *   - quand la forme de la source est connue, on cherche aussi à AFFICHER au
 *     moins `displayTarget` produits de même forme (sinon on complète avec des
 *     voisins alors que des « same » existent un peu plus loin dans le classement).
 * Le plafond de scan (SCAN_CAP de l'appelant) borne cette recherche.
 */
export function needsMoreCandidates(args: {
  sameCount: number
  usableCount: number
  poolTarget: number
  displayTarget: number
  sourceKnown: boolean
}): boolean {
  if (args.usableCount < args.poolTarget) return true
  return args.sourceKnown && args.sameCount < args.displayTarget
}
