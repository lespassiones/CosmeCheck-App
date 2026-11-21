/**
 * Promesse en tête du paywall (03/11/2026) : une phrase bâtie sur le profil de
 * la personne (soucis, objectifs, type de peau, ingrédients évités) plutôt
 * qu'un slogan commun à tous.
 *
 * Priorité du titre : soucis (« contre tes pores et tes taches »), sinon
 * premier objectif (« pour uniformiser ton teint »), sinon type de peau, sinon
 * « faite pour toi ». On promet de TROUVER une routine, jamais un résultat sur
 * la peau : l'app analyse des produits, elle ne soigne pas.
 */

import { PROFILE_GOAL_LABEL, SKIN_TYPE_FACE_LABEL, type ProfileGoal, type SkinConcern, type SkinTypeFace } from '@/lib/skin/profile'
import { CONCERN_OPTIONS } from '@/lib/onboarding/content'

export interface PromiseInput {
  name: string | null
  skinTypeFace?: SkinTypeFace
  concerns: readonly SkinConcern[]
  goals: readonly ProfileGoal[]
  /** « Sans parfum ni sulfates » (`withoutLabel`), ou null. */
  without: string | null
}

export interface PaywallPromise {
  /** Titre en trois morceaux : le milieu est mis en valeur. */
  lead: string
  highlight: string
  tail: string
  subtitle: string
  pills: string[]
}

const MAX_PILLS = 3

/** « Uniformiser mon teint » devient « uniformiser ton teint ». */
export function goalToYou(label: string): string {
  const s = ` ${label} `
    .replace(/ mon /g, ' ton ')
    .replace(/ ma /g, ' ta ')
    .replace(/ mes /g, ' tes ')
    .trim()
  return s.charAt(0).toLowerCase() + s.slice(1)
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** « a », « a et b », « a, b et c ». */
function joinFr(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} et ${items[items.length - 1]}`
}

export function buildPaywallPromise(input: PromiseInput): PaywallPromise {
  const lead = input.name ? `${input.name}, on va trouver ` : 'On va trouver '
  const concerns = CONCERN_OPTIONS.filter((c) => input.concerns.includes(c.key))
  const goals = input.goals.filter((g) => PROFILE_GOAL_LABEL[g]).map((g) => goalToYou(PROFILE_GOAL_LABEL[g]))
  const skin = input.skinTypeFace ? `ta peau ${SKIN_TYPE_FACE_LABEL[input.skinTypeFace].toLowerCase()}` : null

  let highlight = 'ta routine'
  let tail: string
  let usedGoal = false
  if (concerns.length > 0) {
    tail = ` contre ${joinFr(concerns.slice(0, 2).map((c) => c.mine))}.`
  } else if (goals.length > 0) {
    tail = ` pour ${goals[0]}.`
    usedGoal = true
  } else if (skin) {
    highlight = 'la routine'
    tail = ` faite pour ${skin}.`
  } else {
    highlight = 'la routine'
    tail = ' faite pour toi.'
  }

  // Sous-titre : ce que le titre n'a pas dit (peau, ingrédients évités).
  const forWhom = skin && concerns.length + goals.length > 0 ? skin : 'toi'
  const avoid = input.without ? `, ${input.without.charAt(0).toLowerCase()}${input.without.slice(1)}` : ''
  const subtitle = `Perle passe chaque produit au crible pour ${forWhom}${avoid}, et te dit lesquels garder.`

  // Pastilles : les objectifs d'abord, sinon les soucis que le titre n'a pas cités.
  const pills = (usedGoal ? goals.slice(1) : goals).map(capitalize)
  if (pills.length === 0) pills.push(...concerns.slice(2).map((c) => c.label))
  return { lead, highlight, tail, subtitle, pills: pills.slice(0, MAX_PILLS) }
}
