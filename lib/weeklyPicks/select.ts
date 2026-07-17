/**
 * Pépites de la semaine : couche de SÉLECTION pure des picks hebdomadaires.
 *
 * QUOI : à partir des candidats renvoyés par la RPC batch
 * `cosme_check_weekly_picks_candidates` (sur-échantillonnés par need), produit
 * la liste finale de picks affichée sur le dashboard, en respectant :
 *   1. dédoublonnage par EAN (un produit peut matcher plusieurs needs) ;
 *   2. SÉCURITÉ restrictions : filtrage client via filterAlternatives
 *      (token-exact + freeform), même logique que les alternatives ;
 *   3. ordre des tiers de pastille via le score plafonné (applyColorCap) ;
 *   4. round-robin ENTRE les needs (diversité d'intentions), chaque file de
 *      need pré-ordonnée par orderByTierShuffled (variété hebdo déterministe) ;
 *   5. garde diversité DOUBLE :
 *      a. au plus `maxPerSubCategory` produits d'une même sous-catégorie
 *         (fallback sur le need quand la sous-catégorie est nulle) ;
 *      b. au plus `maxPerFamily` produits d'une même GRANDE famille (évite « 3
 *         soins visage d'affilée »), fallback sur le need quand la famille est
 *         nulle ;
 *   6. BACKFILL : si le plafond famille laisse moins de `max` picks alors qu'il
 *      reste de la matière, on complète en relâchant le plafond famille (mais
 *      jamais le plafond sous-catégorie). => diversité quand elle est possible,
 *      liste pleine et pertinente quand le profil est mono-famille (jamais
 *      appauvrie à 2-3 picks).
 *   7. coupe à `max` picks.
 *
 * POURQUOI pur : 0 IA runtime, 0 crédit, 0 dépendance RN. Le déterminisme est
 * porté par la graine `${userId}:${weekKey}:${restrictionsKey}` : même user,
 * même semaine ISO, mêmes restrictions -> exactement les mêmes picks (et un
 * aller-retour de restrictions redonne la même sélection).
 */

import {
  filterAlternatives,
  type AlternativeProduct,
  type ExclusionSet,
} from '@/lib/analysis/alternativesFilter'
import { applyColorCap } from '@/lib/analysis/scoreCap'
import { orderByTierShuffled } from '@/lib/analysis/tierShuffle'

/** Candidat renvoyé par la RPC batch, forme carte produit + need d'origine. */
export interface WeeklyPickCandidate extends AlternativeProduct {
  /** Need de product_intent_mapping ayant fait remonter le produit. */
  need: string
  /** Sous-catégorie catalogue (garde diversité) ; null -> fallback sur need. */
  subCategory: string | null
  /**
   * Grande famille catalogue (product_classifications.category), sert au
   * plafond de diversité par famille. Optionnel : absent -> fallback sur need.
   */
  family?: string | null
}

export interface SelectWeeklyPicksInput {
  /** Sortie RPC mappée ; l'ordre RPC (blocs par need) est préservé en entrée. */
  candidates: WeeklyPickCandidate[]
  /** Restrictions + familles + allergies freeform (buildExclusionSet). */
  exclusion: ExclusionSet
  /** Graine déterministe `${userId}:${weekKey}:${restrictionsKey}`. */
  seed: string
  /** Nombre max de picks (défaut 6, borne 4-8 par le mockup). */
  max?: number
  /** Nb max de produits par sous-catégorie (défaut 2). */
  maxPerSubCategory?: number
  /** Nb max de produits par grande famille avant backfill (défaut 3). */
  maxPerFamily?: number
  /**
   * Plancher de SANTÉ : note PLAFONNÉE (applyColorCap) minimale d'un pick.
   * Défaut 0 (pas de filtre). Passer 13 = uniquement pastilles vertes
   * (feuille ≥13 "Bien" 4★ + cœur ≥17 "Très bien" 5★), jamais jaune/orange/rouge.
   */
  minCappedScore?: number
}

/** Graine canonique des picks : user + semaine ISO + restrictions. */
export function buildWeeklyPicksSeed(
  userId: string,
  weekKey: string,
  restrictionsCanonical: string,
): string {
  return `${userId}:${weekKey}:${restrictionsCanonical}`
}

/** Clé de diversité sous-catégorie : normalisée, sinon le need. */
function diversityKey(c: WeeklyPickCandidate): string {
  const sub = c.subCategory?.trim().toLowerCase()
  return sub && sub.length > 0 ? sub : c.need
}

/** Clé de diversité famille : grande famille normalisée, sinon le need. */
function familyKey(c: WeeklyPickCandidate): string {
  const fam = c.family?.trim().toLowerCase()
  return fam && fam.length > 0 ? fam : c.need
}

/**
 * Pipeline complet de sélection (voir en-tête du module). Pur et déterministe :
 * même input + même seed -> tableau strictement identique.
 */
export function selectWeeklyPicks(
  input: SelectWeeklyPicksInput,
): WeeklyPickCandidate[] {
  const max = input.max ?? 6
  const maxPerSub = input.maxPerSubCategory ?? 2
  const maxPerFamily = input.maxPerFamily ?? 3
  if (max <= 0 || maxPerSub <= 0 || maxPerFamily <= 0 || input.candidates.length === 0) return []

  // 1. Dédoublonnage par EAN : première occurrence gardée (= premier need).
  const seenEans = new Set<string>()
  const deduped: WeeklyPickCandidate[] = []
  for (const c of input.candidates) {
    if (seenEans.has(c.ean)) continue
    seenEans.add(c.ean)
    deduped.push(c)
  }

  // 2. Sécurité restrictions (même logique que les alternatives). Le cast est
  //    sûr : filterAlternatives ne fait que filtrer, les objets sont préservés.
  const safe = filterAlternatives(deduped, input.exclusion) as WeeklyPickCandidate[]
  if (safe.length === 0) return []

  // 3. Score plafonné = celui qui détermine la pastille montrée au clic.
  const cappedScore = (c: WeeklyPickCandidate): number =>
    applyColorCap(c.score ?? 0, c.countOrange, c.countRouge)

  // 3b. Plancher de SANTÉ : on ne garde que les produits dont la pastille est
  //     >= au seuil (défaut 0 = pas de filtre). Sur la note PLAFONNÉE, donc un
  //     produit avec une note stockée haute mais 2 rouges est bien écarté.
  const minScore = input.minCappedScore ?? 0
  const healthy =
    minScore > 0 ? safe.filter((c) => cappedScore(c) >= minScore) : safe
  if (healthy.length === 0) return []

  // 4. Files par need (ordre de première apparition = ordre des needs RPC),
  //    chacune ordonnée par tiers + mélange seedé propre au need.
  const needOrder: string[] = []
  const byNeed = new Map<string, WeeklyPickCandidate[]>()
  for (const c of healthy) {
    const q = byNeed.get(c.need)
    if (q) {
      q.push(c)
    } else {
      byNeed.set(c.need, [c])
      needOrder.push(c.need)
    }
  }
  const queues = needOrder.map((need) => ({
    items: orderByTierShuffled(
      byNeed.get(need) ?? [],
      input.seed + ':' + need,
      cappedScore,
    ),
    cursor: 0,
  }))

  // 5. Round-robin entre needs avec DOUBLE garde diversité (sous-cat + famille).
  //    Un candidat écarté par le plafond FAMILLE est mis de côté (deferred) pour
  //    un backfill éventuel ; un candidat écarté par le plafond SOUS-CATÉGORIE
  //    est abandonné définitivement (compteur monotone).
  const picks: WeeklyPickCandidate[] = []
  const subCount = new Map<string, number>()
  const famCount = new Map<string, number>()
  const deferred: WeeklyPickCandidate[] = []

  let pickedInRound = true
  while (picks.length < max && pickedInRound) {
    pickedInRound = false
    for (const queue of queues) {
      if (picks.length >= max) break
      while (queue.cursor < queue.items.length) {
        const cand = queue.items[queue.cursor]
        queue.cursor += 1
        const sub = diversityKey(cand)
        if ((subCount.get(sub) ?? 0) >= maxPerSub) continue // sous-cat saturée : abandon définitif
        const fam = familyKey(cand)
        if ((famCount.get(fam) ?? 0) >= maxPerFamily) {
          deferred.push(cand) // famille saturée : gardé pour le backfill
          continue
        }
        subCount.set(sub, (subCount.get(sub) ?? 0) + 1)
        famCount.set(fam, (famCount.get(fam) ?? 0) + 1)
        picks.push(cand)
        pickedInRound = true
        break
      }
    }
  }

  // 6. Backfill : profil mono-famille ou matière insuffisante -> on complète
  //    depuis les candidats mis de côté (famille relâchée, sous-cat toujours
  //    plafonnée). Ordre déterministe (ordre de découverte = seedé).
  if (picks.length < max) {
    for (const cand of deferred) {
      if (picks.length >= max) break
      const sub = diversityKey(cand)
      if ((subCount.get(sub) ?? 0) >= maxPerSub) continue
      subCount.set(sub, (subCount.get(sub) ?? 0) + 1)
      picks.push(cand)
    }
  }

  return picks
}
