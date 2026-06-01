/**
 * Comparaison côte à côte de deux analyses — port mobile de
 * CosmetWiki/lib/routine/compare.ts (logique pure, framework-agnostique).
 *
 * Produit des insights actionnables :
 *   - delta de score + delta de counts
 *   - ingrédients pénalisants présents dans A mais pas dans B (et inversement)
 *   - ingrédients déjà présents ailleurs dans la routine (un switch ne
 *     réduirait pas l'exposition cumulée)
 *
 * Inclut aussi `shortenProductName` (porté de lib/text/shortenProductName) car
 * l'écran Compare l'utilise pour les titres et les surlignages, et `lib/text`
 * n'existe pas encore côté mobile.
 */

import type { AnalyseItem, AnalyseResponse } from '@/lib/analysis/types'

export type CompareSide = {
  id: string
  name: string
  score: number | null
  result: AnalyseResponse
}

export type CompareDiff = {
  scoreDelta: number
  winner: 'a' | 'b' | 'tie'
  countsDelta: {
    vert: number
    jaune: number
    orange: number
    rouge: number
  }
  uniqueToA: { name: string; slug: string | null; colorRating: AnalyseItem['colorRating'] }[]
  uniqueToB: { name: string; slug: string | null; colorRating: AnalyseItem['colorRating'] }[]
  shared: { name: string; slug: string | null; colorRating: AnalyseItem['colorRating'] }[]
  insights: string[]
}

function setOfNames(items: AnalyseItem[]): Map<string, AnalyseItem> {
  const m = new Map<string, AnalyseItem>()
  for (const it of items) {
    const key = (it.slug ?? it.name ?? it.input).toUpperCase()
    if (!m.has(key)) m.set(key, it)
  }
  return m
}

export function compareAnalyses(
  a: CompareSide,
  b: CompareSide,
  options: { routineIngredientSlugs?: Set<string> } = {},
): CompareDiff {
  const aScore = a.score ?? 0
  const bScore = b.score ?? 0
  const scoreDelta = Number((bScore - aScore).toFixed(1))
  const winner: 'a' | 'b' | 'tie' =
    Math.abs(scoreDelta) < 0.3 ? 'tie' : scoreDelta > 0 ? 'b' : 'a'

  const aMap = setOfNames(a.result.items)
  const bMap = setOfNames(b.result.items)

  const uniqueToA: CompareDiff['uniqueToA'] = []
  const uniqueToB: CompareDiff['uniqueToB'] = []
  const shared: CompareDiff['shared'] = []

  for (const [k, it] of aMap) {
    if (!bMap.has(k)) {
      if (it.colorRating && it.colorRating !== 'Vert') {
        uniqueToA.push({ name: it.name ?? it.input, slug: it.slug, colorRating: it.colorRating })
      }
    } else {
      shared.push({ name: it.name ?? it.input, slug: it.slug, colorRating: it.colorRating })
    }
  }
  for (const [k, it] of bMap) {
    if (!aMap.has(k)) {
      if (it.colorRating && it.colorRating !== 'Vert') {
        uniqueToB.push({ name: it.name ?? it.input, slug: it.slug, colorRating: it.colorRating })
      }
    }
  }

  // Insight cross-routine : combien d'ingrédients de B sont déjà présents dans
  // d'AUTRES produits de la routine ? Si élevé, switcher vers B ne réduit pas
  // l'exposition globale même si sa note individuelle est meilleure.
  let bOverlapWithRoutine = 0
  if (options.routineIngredientSlugs) {
    for (const it of b.result.items) {
      if (it.slug && options.routineIngredientSlugs.has(it.slug)) {
        bOverlapWithRoutine += 1
      }
    }
  }

  const insights: string[] = []
  if (winner === 'tie') {
    insights.push('Les deux compositions ont une note quasi identique.')
  } else {
    const better = winner === 'a' ? a.name : b.name
    const worse = winner === 'a' ? b.name : a.name
    const abs = Math.abs(scoreDelta).toFixed(1)
    insights.push(`**${better}** est mieux noté que **${worse}** de ${abs} point${Number(abs) > 1 ? 's' : ''}.`)
  }
  if (uniqueToA.length === 0 && uniqueToB.length === 0) {
    insights.push('Compositions identiques sur les ingrédients pénalisants.')
  } else {
    if (uniqueToB.length > 0) {
      const top = uniqueToB.slice(0, 3).map((i) => i.name).join(', ')
      insights.push(
        `**${b.name}** contient ${uniqueToB.length} ingrédient${uniqueToB.length > 1 ? 's' : ''} pénalisant${uniqueToB.length > 1 ? 's' : ''} absent${uniqueToB.length > 1 ? 's' : ''} de **${a.name}** (${top}).`,
      )
    }
    if (uniqueToA.length > 0) {
      const top = uniqueToA.slice(0, 3).map((i) => i.name).join(', ')
      insights.push(
        `**${a.name}** contient ${uniqueToA.length} ingrédient${uniqueToA.length > 1 ? 's' : ''} pénalisant${uniqueToA.length > 1 ? 's' : ''} absent${uniqueToA.length > 1 ? 's' : ''} de **${b.name}** (${top}).`,
      )
    }
  }
  if (bOverlapWithRoutine >= 3) {
    insights.push(
      `Attention : **${b.name}** partage ${bOverlapWithRoutine} ingrédients avec d'autres produits de ta routine - switcher ne réduirait pas significativement ton exposition cumulée.`,
    )
  }

  return {
    scoreDelta,
    winner,
    countsDelta: {
      vert: b.result.counts.vert - a.result.counts.vert,
      jaune: b.result.counts.jaune - a.result.counts.jaune,
      orange: b.result.counts.orange - a.result.counts.orange,
      rouge: b.result.counts.rouge - a.result.counts.rouge,
    },
    uniqueToA: uniqueToA.slice(0, 10),
    uniqueToB: uniqueToB.slice(0, 10),
    shared: shared.slice(0, 10),
    insights,
  }
}

// ─── shortenProductName (port de lib/text/shortenProductName) ────────────────

const LOW_SIGNAL_WORDS = new Set<string>([
  'professionnel',
  'professional',
  'pro',
  'anti-casse',
  'anti-buildup',
  'anti-frizz',
  'anti-frisottis',
  'anti-chute',
  'anti-age',
  'anti-âge',
  'thermo-protecteur',
  'thermoprotector',
  'réparateur',
  'reparateur',
  'repair',
  'jelly',
  'cleansing',
  'shampoo',
  'shampooing',
  'spray',
  '230°c',
  'expression',
  'fusion',
  'care',
])

function dropRepeatedPrefix(words: string[]): string[] {
  if (words.length >= 2 && words[0].toLowerCase() === words[1].toLowerCase()) {
    return words.slice(1)
  }
  return words
}

function joinedLen(words: string[]): number {
  if (words.length === 0) return 0
  return words.reduce((sum, w) => sum + w.length, 0) + (words.length - 1)
}

export function shortenProductName(raw: string, maxLen = 30): string {
  const name = raw.trim()
  if (!name) return name
  if (name.length <= maxLen) return name

  let words = dropRepeatedPrefix(name.split(/\s+/))

  const front: string[] = []
  for (const w of words) {
    if (joinedLen([...front, w]) <= maxLen) {
      front.push(w)
    } else {
      break
    }
  }
  if (front.length >= 2) {
    return front.join(' ')
  }

  words = words.filter((w) => !LOW_SIGNAL_WORDS.has(w.toLowerCase()))
  const front2: string[] = []
  for (const w of words) {
    if (joinedLen([...front2, w]) <= maxLen) {
      front2.push(w)
    } else {
      break
    }
  }
  if (front2.length >= 2) {
    return front2.join(' ')
  }
  if (front2.length === 1) return front2[0]

  return name.slice(0, maxLen - 1).trimEnd() + '…'
}
