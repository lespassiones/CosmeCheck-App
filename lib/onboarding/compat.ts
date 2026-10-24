/**
 * Score de compatibilité de l'onboarding, calculé SANS compte et sans IA.
 *
 * Dans l'app, le score vient de l'Edge Function `personal-insights` (session et
 * crédit exigés). Avant l'inscription, on applique le MÊME moteur additif
 * (`composeCompatScore`, partagé avec l'edge) à des lignes déterministes :
 *   - base : la note du catalogue (/20 → 0-100) ;
 *   - +2 par actif apprécié réellement présent (liste du verdict) ;
 *   - -5 par ingrédient à surveiller pour son type de peau, présent ;
 *   - plafond couleurs (oranges / rouges) ;
 *   - -8 par ingrédient qu'elle a dit vouloir éviter, présent.
 * Sans consentement, le score est celui de la formule seule (`productOnly`).
 *
 * L'écran ne montre que les BONS points (demande du 24/10/2026) : chacun cite
 * un fait vérifié dans la liste du produit, rien n'est inventé.
 *
 * Fonction PURE, testée (`lib/__tests__/onboardingCompat.test.ts`).
 */

import {
  buildCompatLines,
  composeCompatScore,
  type CompatTone,
} from '../../supabase/functions/personal-insights/compat'
import {
  GOAL_SECTIONS,
  RESTRICTION_OPTIONS,
  SKIN_TYPE_SHORT,
  skinRevealFor,
  withoutLabel,
} from '@/lib/onboarding/content'
import { colorKey, findPositives, matchedName, prettyInci, type VerdictInput } from '@/lib/onboarding/verdict'
import type { ProfileGoal } from '@/lib/skin/profile'

export interface OnboardingCompat {
  score: number
  label: string
  tone: CompatTone
  /** Calculé sur le profil (consentement donné), sinon sur la formule seule. */
  personal: boolean
  /** Bons points, du plus personnel au plus général. */
  goodPoints: string[]
}

export interface CompatInput extends VerdictInput {
  goals?: readonly ProfileGoal[]
}

/** Ce qu'un actif apprécié sert, côté objectifs (`does` de la liste du verdict). */
const DOES_TO_GOALS: Record<string, ProfileGoal[]> = {
  hydrater: ['hydrater_profondeur'],
  apaiser: ['calmer_rougeurs', 'renforcer_barriere'],
  renforcer: ['renforcer_barriere'],
  nourrir: ['peau_douce', 'adoucir_corps'],
  'réguler la brillance de': ['teint_uniforme'],
}

function goalLabel(key: ProfileGoal): string | null {
  for (const s of GOAL_SECTIONS) {
    const g = s.goals.find((o) => o.key === key)
    if (g) return g.label
  }
  return null
}

const MAX_POINTS = 4

export function buildOnboardingCompat(input: CompatInput): OnboardingCompat | null {
  const raw = typeof input.score === 'number' && Number.isFinite(input.score) ? input.score : null
  if (raw === null) return null

  let orange = 0
  let red = 0
  let green = 0
  for (const m of input.matches) {
    const k = colorKey(m.color_rating)
    if (k === 'orange') orange += 1
    else if (k === 'rouge') red += 1
    else if (k === 'vert') green += 1
  }
  const total = Math.max(input.ingredientCount, input.matches.length)
  const personal = input.personalized
  const skinWord = input.skin && input.skin !== 'inconnu' ? SKIN_TYPE_SHORT[input.skin] : null

  // Actifs appréciés (bonus) et ingrédients à surveiller pour sa peau (malus).
  const positives = findPositives(input.matches, 10)
  const watch = personal && input.skin ? skinRevealFor(input.skin, input.sensitive).watch : []
  const watchHits = watch.filter((w) => input.matches.some((m) => w.match.test(matchedName(m))))
  const against = watchHits.map((w) => ({
    name: w.inci,
    need: skinWord ? `ta peau ${skinWord}` : 'ta peau',
  }))

  // Ce qu'elle a dit vouloir éviter : familles cochées et ingrédients précis.
  const restrictionLabels: string[] = []
  const respected: string[] = []
  if (personal) {
    for (const key of input.restrictions) {
      const opt = RESTRICTION_OPTIONS.find((o) => o.key === key)
      if (!opt) continue
      const hit = input.matches.some((m) => (m.tags ?? []).some((t) => opt.families.includes(t)))
      if (hit) restrictionLabels.push(opt.label)
      else respected.push(opt.short)
    }
    for (const avoid of input.avoidIngredients ?? []) {
      if (input.matches.some((m) => m.slug === avoid.slug)) restrictionLabels.push(prettyInci(avoid.name))
      else respected.push(prettyInci(avoid.name))
    }
  }

  const result = composeCompatScore({
    scoreOver20: raw,
    orange,
    red,
    iaLines: buildCompatLines({ contributors: positives.map((p) => ({ name: p.fr })), against }),
    restrictionLabels,
    productOnly: !personal,
  })

  // Bons points uniquement, du plus personnel au plus général.
  const points: string[] = []
  const goals = input.goals ?? []
  for (const p of positives) {
    const goal = personal ? (DOES_TO_GOALS[p.does] ?? []).find((g) => goals.includes(g)) : undefined
    const label = goal ? goalLabel(goal) : null
    if (label) points.push(`${p.fr}, pour ton objectif « ${label.toLowerCase()} »`)
    else points.push(`${p.fr}, pour ${p.does} ${personal && skinWord ? `ta peau ${skinWord}` : 'la peau'}`)
    if (points.length >= 2) break
  }
  const without = withoutLabel(respected)
  if (without) points.push(`${without}, comme tu le veux`)
  if (watch.length > 0 && watchHits.length === 0 && skinWord) {
    points.push(`Rien de ce que je surveille pour ta peau ${skinWord}`)
  }
  if (red === 0 && orange === 0 && input.matches.length > 0) points.push('Aucun ingrédient noté orange ou rouge')
  else if (red === 0 && input.matches.length > 0) points.push('Aucun ingrédient noté rouge')
  if (total > 0 && green / total >= 0.5) points.push(`${green} ingrédients sur ${total} notés vert`)

  return {
    score: result.score,
    label: result.label,
    tone: result.tone,
    personal,
    goodPoints: points.slice(0, MAX_POINTS),
  }
}
