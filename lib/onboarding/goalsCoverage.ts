/**
 * « Couverture de tes objectifs » de l'onboarding : ce que le produit scanné
 * fait pour chaque objectif, juste après le score de compatibilité.
 *
 * Objectifs affichés (demande du 24/10/2026) :
 *   - ceux qu'elle a cochés (et son objectif libre « Autre ») ;
 *   - sous 3 objectifs, on complète jusqu'à 5 avec des objectifs SUGGÉRÉS
 *     d'après sa peau, ses soucis et ses cheveux (l'IA choisit, la règle
 *     ci-dessous prend le relais si l'IA ne répond pas) ;
 *   - à 3 objectifs ou plus, rien n'est ajouté.
 *
 * Le pourcentage vient du MOTEUR de la couverture de l'app (goals-coverage) :
 * contribution du produit 0..3 (jugée par l'IA), pondérée par sa qualité,
 * puis saturée (un produit 5 étoiles qui sert fortement l'objectif ≈ 79 %).
 *
 * Fonctions PURES, testées (`lib/__tests__/onboardingGoalsCoverage.test.ts`).
 */

import {
  coverageTone,
  qualityFactor,
  saturate,
  starsFromScore,
  type CoverageTone,
} from '../../supabase/functions/goals-coverage/core'
import {
  isOnboardingGoal,
  suggestionCount,
  type OnboardingGoalKey,
  type OnboardingProfile,
} from '../../supabase/functions/onboarding-goals/core'
import {
  CONCERN_OPTIONS,
  GOAL_SECTIONS,
  HAIR_OPTIONS,
  RESTRICTION_OPTIONS,
  SKIN_TYPE_SHORT,
  type SkinTestAnswer,
} from '@/lib/onboarding/content'
import type { OnboardingDraft } from '@/lib/onboarding/draft'
import { findPositives, type MatchedIngredient } from '@/lib/onboarding/verdict'

export { suggestionCount }

export interface GoalSuggestion {
  key: OnboardingGoalKey
  why: string
}

export interface CoverageRow {
  key: string
  label: string
  percent: number
  tone: CoverageTone
  /** Objectif ajouté par Perle (pas coché par la personne). */
  suggested: boolean
  why: string | null
  isCustom: boolean
}

export interface CoverageResult {
  rows: CoverageRow[]
  covered: CoverageRow[]
  missing: CoverageRow[]
}

export function goalLabel(key: string): string {
  for (const s of GOAL_SECTIONS) {
    const g = s.goals.find((o) => o.key === key)
    if (g) return g.label
  }
  return key
}

/** Objectifs cochés valables pour l'écran, et l'objectif libre. */
export function chosenGoals(draft: Pick<OnboardingDraft, 'goals' | 'otherGoals'>): {
  keys: OnboardingGoalKey[]
  custom: string[]
} {
  const keys = draft.goals.filter(isOnboardingGoal)
  const free = draft.otherGoals?.trim()
  return { keys: [...new Set(keys)], custom: free ? [free.slice(0, 120)] : [] }
}

const BODY_SKIN_WORD: Partial<Record<string, string>> = {
  seche: 'sèche, elle tire',
  tres_seche: 'très sèche',
  sensible: 'sensible',
  mixte: 'mixte',
  normale: 'normale',
}

/** Profil envoyé à l'IA : libellés lisibles, jamais de texte qui ne vient pas d'elle. */
export function profileForAI(
  draft: Pick<
    OnboardingDraft,
    'skinTest' | 'skinSensitive' | 'bodySkin' | 'concerns' | 'otherConcerns' | 'hair' | 'restrictions'
  >,
): OnboardingProfile {
  return {
    skinFace: draft.skinTest && draft.skinTest !== 'inconnu' ? SKIN_TYPE_SHORT[draft.skinTest] : null,
    sensitive: draft.skinSensitive === true,
    bodySkin: draft.bodySkin ? (BODY_SKIN_WORD[draft.bodySkin] ?? null) : null,
    concerns: CONCERN_OPTIONS.filter((c) => draft.concerns.includes(c.key)).map((c) => c.label.toLowerCase()),
    otherConcerns: draft.otherConcerns?.trim() || null,
    hair: HAIR_OPTIONS.filter((h) => h.key !== 'ok' && draft.hair.includes(h.key as never)).map((h) =>
      h.label.toLowerCase(),
    ),
    restrictions: RESTRICTION_OPTIONS.filter((r) => draft.restrictions.includes(r.key)).map((r) => r.short),
  }
}

/** Le profil dit-il quelque chose dont on peut tirer un objectif ? */
export function hasGoalBasis(draft: OnboardingDraft): boolean {
  const { keys, custom } = chosenGoals(draft)
  if (keys.length + custom.length > 0) return true
  return fallbackSuggestions(draft, 1).length > 0
}

// ── Règle de secours (l'IA n'a pas répondu) ──────────────────────────────

const CONCERN_GOALS: Partial<Record<string, OnboardingGoalKey[]>> = {
  acne: ['attenuer_boutons'],
  pores_dilates: ['attenuer_boutons', 'teint_uniforme'],
  exces_sebum: ['teint_uniforme'],
  rougeurs: ['calmer_rougeurs'],
  taches: ['reduire_taches'],
  rides: ['reduire_rides'],
  secheresse: ['hydrater_profondeur'],
  sensibilite: ['renforcer_barriere'],
  vergetures_cellulite: ['reduire_vergetures'],
}

const SKIN_GOALS: Record<SkinTestAnswer, OnboardingGoalKey[]> = {
  grasse: ['attenuer_boutons', 'teint_uniforme'],
  mixte: ['teint_uniforme', 'hydrater_profondeur'],
  seche: ['hydrater_profondeur', 'peau_douce'],
  sensible: ['calmer_rougeurs', 'renforcer_barriere'],
  normale: ['renforcer_barriere', 'peau_douce'],
  inconnu: [],
}

const HAIR_GOALS: Partial<Record<string, OnboardingGoalKey[]>> = {
  secs: ['renforcer_cheveux'],
  ternes_cassants: ['cheveux_brillants', 'renforcer_cheveux'],
  chute: ['reduire_chute'],
  pellicules: ['cuir_chevelu_sain'],
  cuir_chevelu_sensible: ['cuir_chevelu_sain'],
  gras: ['cuir_chevelu_sain'],
}

/** Objectifs déduits du profil, dans l'ordre : soucis, peau, corps, cheveux. */
export function fallbackSuggestions(
  draft: Pick<OnboardingDraft, 'goals' | 'concerns' | 'skinTest' | 'skinSensitive' | 'bodySkin' | 'hair'>,
  count: number,
): GoalSuggestion[] {
  const out: GoalSuggestion[] = []
  const add = (keys: OnboardingGoalKey[] | undefined, why: string) => {
    for (const key of keys ?? []) {
      if (out.length >= count) return
      if (draft.goals.includes(key) || out.some((o) => o.key === key)) continue
      out.push({ key, why })
    }
  }
  for (const c of CONCERN_OPTIONS) {
    if (draft.concerns.includes(c.key)) add(CONCERN_GOALS[c.key], `Tu as dit : ${c.label.toLowerCase()}`)
  }
  if (draft.skinTest) {
    add(SKIN_GOALS[draft.skinTest], draft.skinTest === 'inconnu' ? '' : `Ta peau est ${SKIN_TYPE_SHORT[draft.skinTest]}`)
  }
  if (draft.skinSensitive) add(SKIN_GOALS.sensible, 'Ta peau réagit vite')
  if (draft.bodySkin && draft.bodySkin !== 'normale' && draft.bodySkin !== 'inconnu') {
    add(['adoucir_corps'], 'Ta peau du corps tire')
  }
  for (const h of HAIR_OPTIONS) {
    if (h.key !== 'ok' && draft.hair.includes(h.key as never)) {
      add(HAIR_GOALS[h.key], `Tu as dit : cheveux ${h.label.toLowerCase()}`)
    }
  }
  return out.slice(0, count)
}

/** Ce que font les actifs appréciés de la liste du verdict, objectif par objectif. */
const DOES_RATINGS: Record<string, Partial<Record<OnboardingGoalKey, number>>> = {
  hydrater: { hydrater_profondeur: 2, peau_douce: 1, adoucir_corps: 1 },
  apaiser: { calmer_rougeurs: 2, renforcer_barriere: 1 },
  'resserrer les pores de': { teint_uniforme: 2, attenuer_boutons: 1, reduire_taches: 1 },
  renforcer: { renforcer_barriere: 2, hydrater_profondeur: 1 },
  nourrir: { peau_douce: 2, adoucir_corps: 2 },
  'réguler la brillance de': { teint_uniforme: 2, attenuer_boutons: 1 },
  protéger: { renforcer_barriere: 1 },
}

/** Notes de secours, d'après les seuls actifs reconnus dans la liste. */
export function fallbackRatings(matches: readonly MatchedIngredient[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const p of findPositives(matches, 12)) {
    for (const [k, c] of Object.entries(DOES_RATINGS[p.does] ?? {})) {
      out[k] = Math.max(out[k] ?? 0, c ?? 0)
    }
  }
  return out
}

// ── Calcul ────────────────────────────────────────────────────────────────

/** % d'un objectif servi par UN produit utilisé chaque jour (moteur de l'app). */
export function goalPercent(contribution: number, score: number | null): number {
  const c = Math.max(0, Math.min(3, Math.round(contribution)))
  return saturate(c * qualityFactor(starsFromScore(score)))
}

export function buildCoverage(input: {
  chosen: OnboardingGoalKey[]
  custom: string[]
  suggested: GoalSuggestion[]
  ratings: Record<string, number>
  customRatings: Record<string, number>
  score: number | null
}): CoverageResult {
  const rows: CoverageRow[] = []
  for (const key of input.chosen) {
    const percent = goalPercent(input.ratings[key] ?? 0, input.score)
    rows.push({ key, label: goalLabel(key), percent, tone: coverageTone(percent), suggested: false, why: null, isCustom: false })
  }
  input.custom.forEach((label, i) => {
    const percent = goalPercent(input.customRatings[`custom_${i}`] ?? 0, input.score)
    rows.push({ key: `custom_${i}`, label, percent, tone: coverageTone(percent), suggested: false, why: null, isCustom: true })
  })
  for (const s of input.suggested) {
    if (rows.some((r) => r.key === s.key)) continue
    const percent = goalPercent(input.ratings[s.key] ?? 0, input.score)
    rows.push({
      key: s.key,
      label: goalLabel(s.key),
      percent,
      tone: coverageTone(percent),
      suggested: true,
      why: s.why || null,
      isCustom: false,
    })
  }
  const covered = rows.filter((r) => r.percent > 0).sort((a, b) => b.percent - a.percent)
  const missing = rows.filter((r) => r.percent === 0)
  return { rows, covered, missing }
}

/** Sous ce %, un objectif n'est pas encore bien couvert (seuil du vert de l'app). */
export const WELL_COVERED = 70

/** Objectifs que ce produit seul ne couvre pas bien : ceux que le bouton propose de compléter. */
export function toComplete(rows: readonly CoverageRow[]): number {
  return rows.filter((r) => r.percent < WELL_COVERED).length
}

/** Libellé du bouton : un passage à l'action vers ce qui manque. */
export function ctaLabel(incomplete: number): string {
  if (incomplete > 1) return `Compléter mes ${incomplete} objectifs`
  if (incomplete === 1) return 'Compléter mon objectif'
  return 'Couvrir toute ma routine'
}

/** Phrase au-dessus du bouton. */
export function ctaPitch(incomplete: number, missing: number): string {
  if (incomplete === 0) return 'Bien joué. Je veille à ce que toute ta routine soit à ce niveau.'
  const lead =
    missing > 0 && missing === incomplete
      ? incomplete > 1
        ? `${incomplete} de tes objectifs ne sont pas couverts par ce produit.`
        : "Un de tes objectifs n'est pas couvert par ce produit."
      : incomplete > 1
        ? `Ce produit seul ne suffit pas pour ${incomplete} de tes objectifs.`
        : 'Ce produit seul ne suffit pas pour un de tes objectifs.'
  return `${lead} Je te trouve ${incomplete > 1 ? 'ceux qui les complètent' : 'celui qui le complète'}.`
}
