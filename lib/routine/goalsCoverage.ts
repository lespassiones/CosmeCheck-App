/**
 * goalsCoverage (client) — miroir des parties PARTAGÉES du moteur serveur
 * (supabase/functions/goals-coverage/core.ts) dont le client a besoin :
 *   - signatures routine / objectifs (pour piloter reload + fraîcheur),
 *   - collectGoals + customGoalKey (mêmes clés que le serveur),
 *   - GOALS_COVERAGE_VERSION.
 *
 * Le calcul du % vit UNIQUEMENT côté serveur (edge goals-coverage) ; ici on ne
 * fait QUE lire le résultat persisté et décider de l'état d'affichage. La PARITÉ
 * exacte avec le core (mêmes clés, mêmes signatures) est vérifiée par
 * lib/__tests__/goalsCoverageParity.test.ts.
 *
 * On n'importe PAS le core (Deno, imports « .ts » → casserait Metro/tsc) : on
 * ré-implémente à l'identique la logique partagée, testée pour parité.
 */

import { PROFILE_GOAL_LABEL, type ProfileGoal } from '@/lib/skin/profile'

/** Doit rester égal à GOALS_COVERAGE_VERSION du core (bumper ensemble). */
export const GOALS_COVERAGE_VERSION = 1
export const MAX_CUSTOM_GOALS = 5

/**
 * Objectifs sélectionnables dans le profil mais EXCLUS du bloc de couverture
 * (« simplifier ma routine » n'est pas une couverture mesurable, retiré le
 * 17 juil 2026). IDENTIQUE à core.COVERAGE_EXCLUDED_GOAL_KEYS (parité testée).
 */
export const COVERAGE_EXCLUDED_GOAL_KEYS = new Set<string>(['simplifier_routine'])

export type CoverageTone = 'vert' | 'jaune' | 'orange' | 'rouge'

/** Un objectif couvert, tel que renvoyé/persisté par l'edge. */
export type CoverageItem = {
  key: string
  label: string
  isCustom: boolean
  percent: number
  tone: CoverageTone
  relevantCount: number
}

/** Ligne persistée cosme_check.routine_goal_coverage. */
export type GoalCoverageRow = {
  coverage: CoverageItem[]
  routine_signature: string
  goals_signature: string
  model_version: number
  product_count: number
  updated_at: string
}

export type GoalEntry = { key: string; label: string; isCustom: boolean }

/** Hash 32 bits déterministe (djb2) — IDENTIQUE au core. */
export function djb2(str: string): string {
  let h = 5381
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h + str.charCodeAt(i)) | 0
  }
  return (h >>> 0).toString(36)
}

/** Normalise un texte d'objectif libre — IDENTIQUE au core. */
export function normalizeGoalText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
}

/** Clé cross-user d'un objectif libre — IDENTIQUE au core. */
export function customGoalKey(text: string): string {
  return `free:${djb2(normalizeGoalText(text))}`
}

/** Sous-ensemble objectifs du profil. `goals` accepte string[] (comme le core). */
type SkinGoalsLike = {
  goals?: readonly string[]
  otherGoals?: string
  otherGoalsFace?: string
  otherGoalsBody?: string
  otherGoalsHair?: string
  otherGoalsRoutine?: string
}

/**
 * Rassemble tous les objectifs (prédéfinis + libres) — MÊME logique/ordre que
 * core.collectGoals (dédup, cap MAX_CUSTOM_GOALS). Le label prédéfini vient de
 * PROFILE_GOAL_LABEL (source unique app).
 */
export function collectGoals(skin: SkinGoalsLike): GoalEntry[] {
  const out: GoalEntry[] = []
  const seenKeys = new Set<string>()

  for (const g of skin.goals ?? []) {
    if (typeof g !== 'string') continue
    if (!(g in PROFILE_GOAL_LABEL)) continue
    if (COVERAGE_EXCLUDED_GOAL_KEYS.has(g)) continue // exclu du bloc de couverture
    if (seenKeys.has(g)) continue
    seenKeys.add(g)
    out.push({ key: g, label: PROFILE_GOAL_LABEL[g as ProfileGoal], isCustom: false })
  }

  const customTexts = [
    skin.otherGoals,
    skin.otherGoalsFace,
    skin.otherGoalsBody,
    skin.otherGoalsHair,
    skin.otherGoalsRoutine,
  ]
  const seenNorm = new Set<string>()
  let count = 0
  for (const raw of customTexts) {
    if (count >= MAX_CUSTOM_GOALS) break
    if (typeof raw !== 'string') continue
    const label = raw.trim()
    if (!label) continue
    const norm = normalizeGoalText(label)
    if (!norm || seenNorm.has(norm)) continue
    seenNorm.add(norm)
    const key = customGoalKey(label)
    if (seenKeys.has(key)) continue
    seenKeys.add(key)
    out.push({ key, label: label.slice(0, 120), isCustom: true })
    count++
  }

  return out
}

/** L'utilisateur a-t-il au moins un objectif renseigné ? */
export function hasAnyGoal(skin: SkinGoalsLike): boolean {
  return collectGoals(skin).length > 0
}

/** Signature de l'ensemble des objectifs — IDENTIQUE au core. */
export function goalsSignature(goals: GoalEntry[]): string {
  return goals.map((g) => g.key).sort().join('|')
}

export function goalsSignatureFromSkin(skin: SkinGoalsLike): string {
  return goalsSignature(collectGoals(skin))
}

/** Signature de la routine — IDENTIQUE au core (analysis_id + fréquence, triée). */
export function routineSignatureFromItems(
  items: { analysis_id: string; frequency?: string | null }[],
): string {
  return items
    .filter((i) => i && typeof i.analysis_id === 'string' && i.analysis_id.length > 0)
    .map((i) => `${i.analysis_id}:${i.frequency ?? 'daily'}`)
    .sort()
    .join(',')
}
