/**
 * Moteur DÉTERMINISTE de réorganisation de routine (axe matin / soir + ordre).
 *
 * QUOI : à partir des signaux produit (nom, catégorie, catégorie précise,
 * ingrédients analysés), place chaque produit de la routine dans une section
 * cible (matin, soir, ou section inchangée) avec un rang intra-section, puis
 * fusionne le tout en positions globales persistables (0..n-1).
 *
 * POURQUOI : l'action « Réorganiser ma routine » doit être instantanée,
 * gratuite (zéro IA, zéro crédit) et reproductible : même routine en entrée,
 * même organisation en sortie. Toute la logique vit ici, pure (zéro import
 * React, zéro effet), pour être testable en ts-jest et copiable côté web.
 *
 * Table de règles (la PREMIÈRE règle qui matche gagne) :
 *  1. Nettoyant       -> section inchangée, rank 10
 *  2. SPF / solaire   -> matin, rank 90 (dernier geste du matin)
 *  3. Rétinoïde       -> soir,  rank 60
 *  4. Exfoliant AHA/BHA -> soir, rank 55
 *  5. Vitamine C      -> matin, rank 55
 *  6. Contour des yeux -> section inchangée, rank 65
 *  7. Huile           -> section inchangée, rank 80
 *  8. Hydratant       -> section inchangée, rank 70
 *  9. Sérum           -> section inchangée, rank 50
 * 10. Inclassable     -> section inchangée, rank 50
 *
 * IMPORTANT : la règle SPF s'appuie UNIQUEMENT sur catégorie / catégorie
 * précise / nom. Les tags `filtre-uv` seuls ne suffisent PAS (les crèmes de
 * jour et le maquillage teinté en contiennent) : une crème de jour avec filtre
 * UV reste un hydratant, section inchangée.
 *
 * Aucun score numérique produit n'apparaît ici (règle éditoriale pastille).
 */
import type { AnalyseItem } from '@/lib/analysis/types'
import { classifyItem, type ActiveClass } from '@/lib/inci/activesDictionary'

export type TimeOfDay = 'morning' | 'evening' | 'both'

export type OrganizeReason =
  | 'spf'
  | 'retinoide'
  | 'exfoliant'
  | 'vitamine_c'
  | 'nettoyant'
  | 'contour_yeux'
  | 'hydratant'
  | 'huile'
  | 'serum'
  | 'inclassable'

export interface OrganizeInput {
  itemId: string
  currentTimeOfDay: TimeOfDay
  currentPosition: number
  /** Nom affiché du produit (titleFor(item)). */
  name: string
  /** analyses.category (enum ProductCategory, ex. 'solaire', 'creme_visage'). */
  category: string | null
  /** analyses.category_precise (slug 'famille/sous/type'). */
  categoryPrecise: string | null
  /** Ingrédients analysés (slugs + tags DB) pour la détection d'actifs. */
  items: Pick<AnalyseItem, 'slug' | 'tags' | 'name' | 'input' | 'position'>[]
}

export interface OrganizePlacement {
  itemId: string
  /** Section cible (inchangée si la règle ne force pas de section). */
  timeOfDay: TimeOfDay
  /** Poids d'ordre intra-section (croissant : 10 = premier geste). */
  rank: number
  reason: OrganizeReason
  /** true si timeOfDay diffère de currentTimeOfDay (résumé UI + court-circuit). */
  changed: boolean
}

// Plage des diacritiques combinants (U+0300..U+036F), construite en ASCII pur
// pour éviter tout caractère combinant isolé dans la source (pattern
// activesDictionary).
const COMBINING_DIACRITICS_RE = new RegExp(
  '[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + ']',
  'g',
)

/** Minuscules + suppression des diacritiques (é -> e), sans dépendance. */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING_DIACRITICS_RE, '')
}

// Regex appliquées sur du texte DÉJÀ normalisé (minuscules sans accents).
const CLEANSER_NAME_RE = /nettoyant|demaquillant|micellaire|cleanser/
const SPF_NAME_RE = /\bspf\s*\d+|solaire|sunscreen|ecran\b/
const EYE_RE = /contour.*yeux|\beye\b/
const OIL_NAME_RE = /\bhuile\b|face oil/
const MOISTURIZER_NAME_RE = /creme|hydratant|baume|lait\b/
const SERUM_RE = /serum/

/** Classes d'actifs présentes dans la liste INCI du produit (slug + tags DB). */
function detectClasses(items: OrganizeInput['items']): Set<ActiveClass> {
  const found = new Set<ActiveClass>()
  for (const it of items) {
    for (const cls of classifyItem(it.slug, it.tags)) found.add(cls)
  }
  return found
}

interface RuleHit {
  reason: OrganizeReason
  rank: number
  /** Section forcée par la règle, ou null = conserver currentTimeOfDay. */
  forced: TimeOfDay | null
}

/** Applique la table de règles : la première qui matche gagne. */
function applyRules(input: OrganizeInput): RuleHit {
  const name = normalize(input.name)
  const category = normalize(input.category ?? '')
  const categoryPrecise = normalize(input.categoryPrecise ?? '')

  // 1. Nettoyant : premier geste, section inchangée (un nettoyant à l'acide
  //    salicylique reste un nettoyant : priorité sur la règle exfoliant).
  if (
    category === 'nettoyant_visage' ||
    categoryPrecise.includes('nettoyant') ||
    categoryPrecise.includes('demaquillant') ||
    CLEANSER_NAME_RE.test(name)
  ) {
    return { reason: 'nettoyant', rank: 10, forced: null }
  }

  // 2. SPF / solaire : signaux catégorie / catégorie précise / nom UNIQUEMENT
  //    (les tags filtre-uv seuls sur-détecteraient les crèmes de jour).
  if (
    category === 'solaire' ||
    categoryPrecise.startsWith('produit-solaire') ||
    SPF_NAME_RE.test(name)
  ) {
    return { reason: 'spf', rank: 90, forced: 'morning' }
  }

  // Règles 3-5 : détection d'actifs via le dictionnaire canonique (slugs
  // vérifiés en DB + tags 'retinoides' / 'acide-salicylique').
  const classes = detectClasses(input.items)

  // 3. Rétinoïde : photosensibilisant, le soir.
  if (classes.has('retinoid')) {
    return { reason: 'retinoide', rank: 60, forced: 'evening' }
  }

  // 4. Exfoliant fort AHA/BHA : le soir. Les PHA (acides doux) sont
  //    volontairement EXCLUS (pas de contrainte de section).
  if (classes.has('aha') || classes.has('bha')) {
    return { reason: 'exfoliant', rank: 55, forced: 'evening' }
  }

  // 5. Vitamine C (pure ou dérivée) : antioxydant, le matin.
  if (classes.has('vitc_pure') || classes.has('vitc_derivative')) {
    return { reason: 'vitamine_c', rank: 55, forced: 'morning' }
  }

  // 6. Contour des yeux.
  if (EYE_RE.test(name) || EYE_RE.test(categoryPrecise)) {
    return { reason: 'contour_yeux', rank: 65, forced: null }
  }

  // 7. Huile (l'huile démaquillante est déjà captée par la règle 1).
  if (OIL_NAME_RE.test(name)) {
    return { reason: 'huile', rank: 80, forced: null }
  }

  // 8. Hydratant.
  if (
    category === 'creme_visage' ||
    category === 'creme_corps' ||
    MOISTURIZER_NAME_RE.test(name)
  ) {
    return { reason: 'hydratant', rank: 70, forced: null }
  }

  // 9. Sérum (comparaison en NFD sans accents : 'Sérum' matche).
  if (SERUM_RE.test(name) || SERUM_RE.test(categoryPrecise)) {
    return { reason: 'serum', rank: 50, forced: null }
  }

  // 10. Inclassable : on ne touche à rien (section conservée, y compris 'both').
  return { reason: 'inclassable', rank: 50, forced: null }
}

/**
 * Placement de chaque produit selon la table de règles. Sortie alignée sur
 * l'ordre des entrées (1 placement par input, même itemId).
 */
export function organizeRoutine(inputs: OrganizeInput[]): OrganizePlacement[] {
  return inputs.map((input) => {
    const hit = applyRules(input)
    const timeOfDay = hit.forced ?? input.currentTimeOfDay
    return {
      itemId: input.itemId,
      timeOfDay,
      rank: hit.rank,
      reason: hit.reason,
      changed: timeOfDay !== input.currentTimeOfDay,
    }
  })
}

interface SortEntry {
  placement: OrganizePlacement
  rank: number
  currentPosition: number
  name: string
}

function compareEntries(a: SortEntry, b: SortEntry): number {
  if (a.rank !== b.rank) return a.rank - b.rank
  if (a.currentPosition !== b.currentPosition) return a.currentPosition - b.currentPosition
  if (a.name !== b.name) return a.name < b.name ? -1 : 1
  // Filet de déterminisme total (deux items strictement identiques).
  return a.placement.itemId < b.placement.itemId ? -1 : 1
}

/**
 * Ordre final persistable : fusionne les placements en positions GLOBALES
 * 0..n-1 (une seule colonne `position` par item, cf. décision 0.1).
 *
 * Tri par section (matin puis soir-only), rank ASC, puis currentPosition ASC,
 * puis nom normalisé (stabilité). Les items 'both' sont placés selon leur
 * rang MATIN et reçoivent UNE seule position (rang relatif partagé entre les
 * deux sections).
 */
export function computePositions(
  placements: OrganizePlacement[],
  inputs: OrganizeInput[],
): { itemId: string; timeOfDay: TimeOfDay; position: number }[] {
  const byId = new Map(inputs.map((i) => [i.itemId, i]))

  const toEntry = (placement: OrganizePlacement): SortEntry => {
    const input = byId.get(placement.itemId)
    return {
      placement,
      rank: placement.rank,
      currentPosition: input?.currentPosition ?? 0,
      name: normalize(input?.name ?? ''),
    }
  }

  // Section matin = morning + both (les 'both' suivent leur rang matin).
  const morning = placements
    .filter((p) => p.timeOfDay !== 'evening')
    .map(toEntry)
    .sort(compareEntries)
  const eveningOnly = placements
    .filter((p) => p.timeOfDay === 'evening')
    .map(toEntry)
    .sort(compareEntries)

  return [...morning, ...eveningOnly].map((entry, index) => ({
    itemId: entry.placement.itemId,
    timeOfDay: entry.placement.timeOfDay,
    position: index,
  }))
}

/** Ligne minimale de routine pour le recalcul d'ordre après un drag. */
export interface RoutinePositionRow {
  itemId: string
  timeOfDay: TimeOfDay
  position: number
}

/**
 * Recalcule les positions après un drag INTRA-SECTION.
 *
 * Principe : on ré-attribue le multiset TRIÉ des positions existantes des
 * items de la section dans le nouvel ordre visuel. Seules les lignes de la
 * section bougent, l'entrelacement avec l'autre section est préservé (les
 * items 'both' appartiennent aux deux sections : les réordonner ici change
 * aussi leur rang relatif dans l'autre section, décision 0.1 assumée).
 *
 * Cas dégradé : si la liste complète contient des positions en DOUBLON
 * (héritage du default 0 avant backfill), on renumérote TOUTE la liste
 * 0..n-1 dans le même appel, en suivant l'ordre d'affichage fourni et le
 * nouvel ordre de la section.
 *
 * @param items    Liste COMPLÈTE de la routine, dans l'ordre d'affichage.
 * @param section  Section réordonnée ('morning' | 'evening').
 * @param newOrder Nouveaux itemIds ordonnés de la section (les 'both' inclus).
 * @returns        Mises à jour MINIMALES { id, position } (uniquement les
 *                 lignes dont la position change réellement).
 */
export function normalizeSectionOrder(
  items: RoutinePositionRow[],
  section: 'morning' | 'evening',
  newOrder: string[],
): { id: string; position: number }[] {
  const belongs = (t: TimeOfDay): boolean => t === section || t === 'both'
  const sectionItems = items.filter((it) => belongs(it.timeOfDay))
  const sectionIds = new Set(sectionItems.map((it) => it.itemId))

  // Assainissement défensif : on ignore les ids inconnus / hors section et les
  // doublons, puis on rajoute en fin les items de section oubliés (dans leur
  // ordre actuel) pour toujours produire une permutation complète.
  const seen = new Set<string>()
  const cleaned: string[] = []
  for (const id of newOrder) {
    if (sectionIds.has(id) && !seen.has(id)) {
      seen.add(id)
      cleaned.push(id)
    }
  }
  for (const it of sectionItems) {
    if (!seen.has(it.itemId)) cleaned.push(it.itemId)
  }

  const currentPos = new Map(items.map((it) => [it.itemId, it.position]))
  const updates: { id: string; position: number }[] = []

  const hasDuplicates = new Set(items.map((it) => it.position)).size !== items.length
  if (hasDuplicates) {
    // Renumérotation complète 0..n-1 : on remplace les slots de la section par
    // le nouvel ordre, les autres lignes gardent leur place d'affichage.
    let cursor = 0
    const fullOrder = items.map((it) => (belongs(it.timeOfDay) ? cleaned[cursor++] : it.itemId))
    fullOrder.forEach((id, index) => {
      if (currentPos.get(id) !== index) updates.push({ id, position: index })
    })
    return updates
  }

  // Cas nominal : permutation locale du multiset trié des positions existantes.
  const sortedPositions = sectionItems.map((it) => it.position).sort((a, b) => a - b)
  cleaned.forEach((id, index) => {
    const next = sortedPositions[index]
    if (currentPos.get(id) !== next) updates.push({ id, position: next })
  })
  return updates
}
