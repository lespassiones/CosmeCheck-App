/**
 * Lecture IA de la couverture des objectifs (Edge `onboarding-goals`), avec la
 * règle de secours si l'IA ne répond pas à temps.
 *
 * Lancée dès l'écran du score de compatibilité (`prefetchGoalsCoverage`) pour
 * que l'écran suivant s'affiche sans attendre. Une même demande (même produit,
 * mêmes réponses) n'est faite qu'une fois par session.
 */

import { supabase } from '@/lib/supabase/client'
import { parseInciList } from '@/lib/inci/parser'
import type { OnboardingDraft } from '@/lib/onboarding/draft'
import { matchIngredients } from '@/lib/onboarding/productLookup'
import {
  buildCoverage,
  chosenGoals,
  fallbackRatings,
  fallbackSuggestions,
  profileForAI,
  suggestionCount,
  type CoverageResult,
  type GoalSuggestion,
} from '@/lib/onboarding/goalsCoverage'

/** Au-delà, on affiche la règle de secours : l'écran ne doit pas faire attendre. */
const AI_TIMEOUT_MS = 25_000

export type LoadedCoverage = CoverageResult & { source: 'ai' | 'fallback' }

interface AIResponse {
  ratings?: Record<string, number>
  custom?: Record<string, number>
  suggested?: GoalSuggestion[]
}

const memo = new Map<string, Promise<LoadedCoverage>>()

function keyFor(draft: OnboardingDraft): string | null {
  const p = draft.scanned
  if (!p) return null
  return JSON.stringify([
    p.ean ?? p.name,
    draft.goals,
    draft.otherGoals ?? '',
    draft.skinTest,
    draft.skinSensitive,
    draft.bodySkin,
    draft.concerns,
    draft.otherConcerns ?? '',
    draft.hair,
    draft.restrictions,
  ])
}

async function callAI(draft: OnboardingDraft): Promise<AIResponse | null> {
  const p = draft.scanned
  if (!p) return null
  const { keys, custom } = chosenGoals(draft)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS)
  try {
    const { data, error } = await supabase.functions.invoke('onboarding-goals', {
      body: {
        product: {
          ean: p.ean,
          name: p.name,
          brand: p.brand,
          score: p.score,
          ingredients: parseInciList(p.ingredientsText).map((t) => t.raw),
        },
        goals: keys,
        customGoals: custom,
        profile: profileForAI(draft),
      },
      signal: controller.signal,
    } as never)
    if (error || !data || typeof data !== 'object') return null
    return data as AIResponse
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function load(draft: OnboardingDraft): Promise<LoadedCoverage> {
  const p = draft.scanned!
  const { keys, custom } = chosenGoals(draft)
  const count = suggestionCount(keys.length + custom.length)
  const [ai, read] = await Promise.all([callAI(draft), matchIngredients(p.ingredientsText)])

  const aiRatings = ai?.ratings && Object.keys(ai.ratings).length > 0 ? ai.ratings : null
  const ratings = aiRatings ?? fallbackRatings(read.ok ? read.matches : [])
  // Suggestions IA d'abord ; s'il en manque, la règle complète (jamais de doublon).
  let suggested: GoalSuggestion[] = Array.isArray(ai?.suggested) ? ai!.suggested.slice(0, count) : []
  if (suggested.length < count) {
    const more = fallbackSuggestions({ ...draft, goals: [...draft.goals, ...suggested.map((s) => s.key)] }, count - suggested.length)
    suggested = [...suggested, ...more]
  }
  const result = buildCoverage({
    chosen: keys,
    custom,
    suggested,
    ratings,
    customRatings: ai?.custom ?? {},
    score: p.score,
  })
  return { ...result, source: aiRatings ? 'ai' : 'fallback' }
}

/** Couverture des objectifs pour ce brouillon (une seule demande par réponses identiques). */
export function loadGoalsCoverage(draft: OnboardingDraft): Promise<LoadedCoverage> | null {
  const key = keyFor(draft)
  if (!key) return null
  let pending = memo.get(key)
  if (!pending) {
    pending = load(draft)
    memo.set(key, pending)
    // Un échec ne reste pas en mémoire : l'écran pourra relancer.
    pending.catch(() => memo.delete(key))
  }
  return pending
}

/** À appeler un écran plus tôt : la réponse est prête quand l'écran s'ouvre. */
export function prefetchGoalsCoverage(draft: OnboardingDraft): void {
  void loadGoalsCoverage(draft)
}
