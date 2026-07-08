/**
 * Pépites de la semaine : cartographie profil beauté -> besoins produit (needs).
 *
 * QUOI : traduit les signaux du profil peau (préoccupations, objectifs, cheveux)
 * en "needs" de la table cosme_check.product_intent_mapping, avec des poids
 * cumulables. `pickNeedsForUser` en déduit les N besoins dominants de la
 * semaine, de façon PUREMENT DÉTERMINISTE (aucune IA, aucun crédit).
 *
 * POURQUOI : la RPC batch `cosme_check_weekly_picks_candidates` prend une liste
 * de needs en entrée ; ce module est LA source unique du vocabulaire de needs
 * côté client. INTENT_NEEDS reflète EXACTEMENT les 15 slugs semés par la
 * migration 20260701_create_product_intent_mapping.sql (ordre du INSERT
 * conservé : il sert de tie-break stable au classement).
 *
 * Déterminisme : même profil + même semaine ISO -> mêmes needs. Un profil sans
 * aucun signal tombe sur une rotation "grand public" mélangée par la clé de
 * semaine (seededShuffle), donc stable toute la semaine et différente la
 * semaine suivante.
 */

import { hashSeed, seededShuffle } from '@/lib/analysis/tierShuffle'
import type { SkinProfile } from '@/lib/skin/profile'

/**
 * Slugs des besoins produit, copie EXACTE du seed de
 * cosme_check.product_intent_mapping (migration 20260701). L'ordre du tableau
 * est celui du INSERT et sert de tie-break déterministe dans pickNeedsForUser.
 */
export const INTENT_NEEDS = [
  'odor_control_feet',
  'hydration_face',
  'anti_aging',
  'sensitivity_face',
  'shampoo_dry_hair',
  'hand_care',
  'acne_prone',
  'sun_protection',
  'lip_care',
  'eye_care',
  'scalp_health',
  'body_hydration',
  'anti_cellulite',
  'brightening',
  'calming_sensitive',
] as const
export type IntentNeed = (typeof INTENT_NEEDS)[number]

/** Un besoin pondéré (poids 1..3, cumulé sur tous les signaux du profil). */
export interface NeedWeight {
  need: IntentNeed
  w: number
}

/** Préoccupations peau (SKIN_CONCERNS) -> besoins pondérés. Exhaustif (testé). */
export const CONCERN_NEEDS: Record<string, NeedWeight[]> = {
  acne: [{ need: 'acne_prone', w: 3 }],
  rides: [
    { need: 'anti_aging', w: 3 },
    { need: 'eye_care', w: 1 },
  ],
  taches: [{ need: 'brightening', w: 3 }],
  secheresse: [
    { need: 'hydration_face', w: 3 },
    { need: 'body_hydration', w: 1 },
  ],
  rougeurs: [
    { need: 'calming_sensitive', w: 3 },
    { need: 'sensitivity_face', w: 2 },
  ],
  sensibilite: [
    { need: 'sensitivity_face', w: 3 },
    { need: 'calming_sensitive', w: 2 },
  ],
  pores_dilates: [
    { need: 'acne_prone', w: 2 },
    { need: 'brightening', w: 1 },
  ],
  exces_sebum: [{ need: 'acne_prone', w: 2 }],
  cernes_poches: [{ need: 'eye_care', w: 3 }],
  vergetures_cellulite: [
    { need: 'anti_cellulite', w: 3 },
    { need: 'body_hydration', w: 1 },
  ],
}

/** Objectifs (PROFILE_GOALS) -> besoins pondérés. Exhaustif (testé). */
export const GOAL_NEEDS: Record<string, NeedWeight[]> = {
  peau_douce: [
    { need: 'hydration_face', w: 2 },
    { need: 'body_hydration', w: 1 },
  ],
  teint_uniforme: [{ need: 'brightening', w: 2 }],
  attenuer_boutons: [{ need: 'acne_prone', w: 3 }],
  reduire_rides: [{ need: 'anti_aging', w: 3 }],
  calmer_rougeurs: [{ need: 'calming_sensitive', w: 3 }],
  hydrater_profondeur: [{ need: 'hydration_face', w: 3 }],
  reduire_taches: [{ need: 'brightening', w: 3 }],
  renforcer_barriere: [
    { need: 'sensitivity_face', w: 2 },
    { need: 'hydration_face', w: 1 },
  ],
  adoucir_corps: [{ need: 'body_hydration', w: 3 }],
  reduire_vergetures: [{ need: 'anti_cellulite', w: 3 }],
  proteger_soleil: [{ need: 'sun_protection', w: 3 }],
  cheveux_brillants: [{ need: 'shampoo_dry_hair', w: 2 }],
  renforcer_cheveux: [{ need: 'shampoo_dry_hair', w: 3 }],
  definir_boucles: [{ need: 'shampoo_dry_hair', w: 2 }],
  cuir_chevelu_sain: [{ need: 'scalp_health', w: 3 }],
  reduire_chute: [{ need: 'scalp_health', w: 2 }],
  simplifier_routine: [
    { need: 'hydration_face', w: 1 },
    { need: 'sun_protection', w: 1 },
  ],
  decouvrir_clean: [
    { need: 'hydration_face', w: 1 },
    { need: 'brightening', w: 1 },
  ],
}

/** Préoccupations cheveux (HAIR_CONCERNS) -> besoins pondérés. Exhaustif (testé). */
export const HAIR_NEEDS: Record<string, NeedWeight[]> = {
  secs: [{ need: 'shampoo_dry_hair', w: 3 }],
  gras: [{ need: 'scalp_health', w: 2 }],
  cuir_chevelu_sensible: [{ need: 'scalp_health', w: 3 }],
  chute: [{ need: 'scalp_health', w: 2 }],
  pellicules: [{ need: 'scalp_health', w: 3 }],
  ternes_cassants: [{ need: 'shampoo_dry_hair', w: 2 }],
}

/**
 * Rotation par défaut (profil sans concerns/goals/cheveux) : needs
 * "grand public", volontairement SANS odor_control_feet.
 */
export const DEFAULT_ROTATION: readonly IntentNeed[] = [
  'hydration_face',
  'brightening',
  'sun_protection',
  'body_hydration',
  'anti_aging',
  'acne_prone',
  'lip_care',
  'hand_care',
]

/**
 * Top N besoins pondérés du profil (poids cumulés, tri décroissant, tie-break
 * par l'ordre d'INTENT_NEEDS).
 *
 * - Profil sans aucun signal -> `count` needs tirés de DEFAULT_ROTATION via
 *   seededShuffle(hashSeed(weekKey)) : stable toute la semaine, différent la
 *   semaine suivante.
 * - Profil avec moins de needs distincts que `count` -> complété depuis la
 *   même rotation hebdomadaire (sans doublon), pour garder assez de matière
 *   côté RPC et de la diversité dans les picks.
 *
 * Déterministe : mêmes (profil, weekKey, count) -> même résultat.
 */
export function pickNeedsForUser(
  skin: SkinProfile,
  weekKey: string,
  count = 3,
): IntentNeed[] {
  const wanted = Math.max(0, count)
  if (wanted === 0) return []

  const weights = new Map<IntentNeed, number>()
  const add = (entries: NeedWeight[] | undefined) => {
    if (!entries) return
    for (const e of entries) weights.set(e.need, (weights.get(e.need) ?? 0) + e.w)
  }
  for (const c of skin.concerns ?? []) add(CONCERN_NEEDS[c])
  for (const g of skin.goals ?? []) add(GOAL_NEEDS[g])
  for (const h of skin.hairConcerns ?? []) add(HAIR_NEEDS[h])

  // Rotation hebdo déterministe (sert de fallback ET de complément).
  const rotation = seededShuffle(DEFAULT_ROTATION, hashSeed(weekKey))

  if (weights.size === 0) return rotation.slice(0, wanted)

  const ranked = Array.from(weights.entries())
    .sort(
      (a, b) =>
        b[1] - a[1] || INTENT_NEEDS.indexOf(a[0]) - INTENT_NEEDS.indexOf(b[0]),
    )
    .map(([need]) => need)

  const picked = ranked.slice(0, wanted)
  for (const n of rotation) {
    if (picked.length >= wanted) break
    if (!picked.includes(n)) picked.push(n)
  }
  return picked
}
