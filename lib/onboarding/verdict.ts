/**
 * Verdict express de l'écran « La différence » (A17), calculé sans compte.
 *
 * Avant l'inscription, l'analyseur (Edge Function authentifiée) n'est pas
 * accessible. On compose donc le verdict avec ce qui est public :
 *   - la note du catalogue (calculée par le moteur déterministe, sans IA) ;
 *   - le détail par ingrédient de `cosme_check_match_inci_batch` (couleur et
 *     familles de chaque ingrédient) ;
 *   - les réponses de la personne (type de peau, ingrédients à éviter).
 *
 * Fonction PURE, testée (`lib/__tests__/onboardingVerdict.test.ts`).
 * Aucune alerte n'est inventée : chaque ligne cite un ingrédient réellement
 * présent dans la liste du produit.
 */

import { applyColorCap, scoreLabelFromScore } from '@/lib/analysis/scoreCap'
import { verdictToneFromScore, type VerdictTone as StarTone } from '@/lib/essentiel/engine'
import {
  RESTRICTION_OPTIONS,
  skinRevealFor,
  SKIN_TYPE_SHORT,
  type RestrictionKey,
  type SkinTestAnswer,
} from '@/lib/onboarding/content'

/** Ligne renvoyée par `cosme_check_match_inci_batch` (champs utiles). */
export interface MatchedIngredient {
  input_token: string
  position_idx: number
  slug?: string | null
  name: string | null
  color_rating: string | null
  tags: string[] | null
  match_kind: string | null
}

export type VerdictTone = 'vert' | 'jaune' | 'orange' | 'rouge'

export interface VerdictLine {
  title: string
  detail: string
}

export interface QuickVerdict {
  counts: { vert: number; jaune: number; orange: number; rouge: number; total: number }
  /**
   * Tonalité des étoiles, calculée EXACTEMENT comme l'aperçu de scan et la
   * fiche produit : note du catalogue plafonnée par les ingrédients orange et
   * rouge (`applyColorCap`), puis `verdictToneFromScore`.
   */
  starTone: StarTone
  /** « Très bien », « Bien », « Moyen », « Faible », ou `null` sans note. */
  scoreLabel: string | null
  tone: VerdictTone | null
  alerts: VerdictLine[]
  positives: VerdictLine[]
  claims: string[]
  kind: 'alerts' | 'clean' | 'neutral'
}

export interface VerdictInput {
  productName: string
  score: number | null
  scoreLabel: string | null
  /** Nombre d'ingrédients de la liste, reconnus ou non. */
  ingredientCount: number
  matches: readonly MatchedIngredient[]
  skin: SkinTestAnswer | null
  restrictions: readonly RestrictionKey[]
  /** Ingrédients précis que la personne veut éviter (suggestions de « + Autre »). */
  avoidIngredients?: readonly { slug: string; name: string }[]
  /** Peau du visage qui réagit vite, en plus de son type principal. */
  sensitive?: boolean
  /** Consentement refusé : pas de personnalisation, alertes génériques. */
  personalized: boolean
}

/** Mise en forme d'un nom INCI : « LINALOOL » → « Linalool ». */
export function prettyInci(name: string): string {
  return name
    .toLowerCase()
    .replace(/(^|[\s(/-])([a-z])/g, (_m, p: string, c: string) => p + c.toUpperCase())
    .replace(/\bPeg\b/g, 'PEG')
    .replace(/\bDenat\b/g, 'denat')
}

function joinNames(names: string[], max = 2): string {
  const uniq = [...new Set(names)]
  const shown = uniq.slice(0, max)
  return uniq.length > max ? `${shown.join(', ')}…` : shown.join(', ')
}

/** Tonalité d'une note sur 20 (mêmes seuils que l'app). */
export function toneForScore(score: number): VerdictTone {
  if (score >= 13) return 'vert'
  if (score >= 9) return 'orange'
  return 'rouge'
}


/** Actifs appréciés, avec ce qu'ils font, pour la ligne verte. */
const POSITIVES: { match: RegExp; fr: string; does: string }[] = [
  { match: /^glycerin$/, fr: 'Glycérine', does: 'hydrater' },
  { match: /^panthenol$/, fr: 'Panthénol', does: 'apaiser' },
  { match: /^niacinamide$/, fr: 'Niacinamide', does: 'resserrer les pores de' },
  { match: /^(sodium hyaluronate|hyaluronic acid)$/, fr: 'Acide hyaluronique', does: 'hydrater' },
  { match: /^ceramide/, fr: 'Céramides', does: 'renforcer' },
  { match: /^allantoin$/, fr: 'Allantoïne', does: 'apaiser' },
  { match: /^squalane$/, fr: 'Squalane', does: 'nourrir' },
  { match: /^zinc pca$/, fr: 'Zinc PCA', does: 'réguler la brillance de' },
  { match: /^(butyrospermum parkii butter|shea butter)$/, fr: 'Beurre de karité', does: 'nourrir' },
  { match: /^aloe barbadensis leaf (juice|extract)$/, fr: 'Aloe vera', does: 'apaiser' },
  { match: /^madecassoside$|^centella asiatica/, fr: 'Centella', does: 'apaiser' },
  { match: /^tocopherol$/, fr: 'Vitamine E', does: 'protéger' },
]

/** Promesses de devant de flacon reconnues dans le nom du produit. */
const CLAIMS: { match: RegExp; label: string }[] = [
  { match: /peaux? sensibles?|sensitive/i, label: 'Peaux sensibles' },
  { match: /hypoallerg/i, label: 'Hypoallergénique' },
  { match: /\bdouce?s?\b|douceur|gentle/i, label: 'Formule douce' },
  { match: /apais|calm|sooth/i, label: 'Apaisant' },
  { match: /hydrat|moistur/i, label: 'Hydratant' },
  { match: /nourri/i, label: 'Nourrissant' },
  { match: /purif/i, label: 'Purifiant' },
  { match: /natur/i, label: 'Naturel' },
  { match: /\bbio\b|organic/i, label: 'Bio' },
  { match: /sans parfum|fragrance[- ]free|parfum free/i, label: 'Sans parfum' },
  { match: /anti[- ]?imperfection|anti[- ]?acn/i, label: 'Anti-imperfections' },
  { match: /anti[- ]?(âge|age|rides)/i, label: 'Anti-âge' },
]

export function detectClaims(productName: string, max = 3): string[] {
  const out: string[] = []
  for (const c of CLAIMS) {
    if (c.match.test(productName) && !out.includes(c.label)) out.push(c.label)
    if (out.length >= max) break
  }
  return out
}

function colorKey(rating: string | null): VerdictTone | null {
  switch ((rating ?? '').toLowerCase()) {
    case 'vert':
      return 'vert'
    case 'jaune':
      return 'jaune'
    case 'orange':
      return 'orange'
    case 'rouge':
      return 'rouge'
    default:
      return null
  }
}

export function buildQuickVerdict(input: VerdictInput): QuickVerdict {
  const counts = { vert: 0, jaune: 0, orange: 0, rouge: 0, total: Math.max(input.ingredientCount, input.matches.length) }
  for (const m of input.matches) {
    const k = colorKey(m.color_rating)
    if (k) counts[k] += 1
  }

  const lowerName = (m: MatchedIngredient) => (m.name ?? m.input_token).toLowerCase().trim()
  const alerts: VerdictLine[] = []
  const skinWord = input.skin && input.skin !== 'inconnu' ? SKIN_TYPE_SHORT[input.skin] : null

  if (input.personalized) {
    // 0. Ingrédients précis qu'elle a nommés : l'alerte la plus directe.
    for (const avoid of input.avoidIngredients ?? []) {
      const hit = input.matches.find((m) => m.slug === avoid.slug)
      if (!hit) continue
      alerts.push({
        title: `Contient ${prettyInci(hit.name ?? avoid.name)}`,
        detail: 'Tu as dit vouloir l’éviter',
      })
    }

    // 1. Ingrédients qu'elle a demandé d'éviter : alerte forte, citée.
    for (const key of input.restrictions) {
      const opt = RESTRICTION_OPTIONS.find((o) => o.key === key)
      if (!opt) continue
      const hits = input.matches.filter((m) => (m.tags ?? []).some((t) => opt.families.includes(t)))
      if (hits.length === 0) continue
      const said: string[] = []
      if ((input.skin === 'sensible' || input.sensitive) && (key === 'parfum' || key === 'huiles')) {
        said.push('peau sensible')
      }
      said.push(`${opt.short} à éviter`)
      alerts.push({
        title: `Contient ${opt.alert} (${joinNames(hits.map((h) => prettyInci(h.name ?? h.input_token)))})`,
        detail: `Tu as dit : ${said.join(', ')}`,
      })
    }

    // 2. Ingrédients à surveiller pour son type de peau (écran A8).
    const watch = input.skin ? skinRevealFor(input.skin, input.sensitive).watch : []
    for (const w of watch) {
      const hits = input.matches.filter((m) => w.match.test(lowerName(m)))
      if (hits.length === 0) continue
      const already = alerts.some((a) => a.title.includes(prettyInci(hits[0].name ?? hits[0].input_token)))
      if (already) continue
      alerts.push({
        title: `Contient ${w.label} (${joinNames(hits.map((h) => prettyInci(h.name ?? h.input_token)))})`,
        detail: skinWord ? `Tu as une peau ${skinWord} : ${w.why.toLowerCase()}` : w.why,
      })
    }
  } else {
    // Sans profil : on signale seulement ce que la base note orange ou rouge.
    const risky = input.matches.filter((m) => {
      const k = colorKey(m.color_rating)
      return k === 'orange' || k === 'rouge'
    })
    if (risky.length > 0) {
      alerts.push({
        title: `À surveiller : ${joinNames(risky.map((r) => prettyInci(r.name ?? r.input_token)), 3)}`,
        detail: 'Notés orange ou rouge dans notre base',
      })
    }
  }

  // Ligne verte : au plus deux actifs appréciés réellement présents.
  const found: { fr: string; does: string }[] = []
  for (const p of POSITIVES) {
    if (input.matches.some((m) => p.match.test(lowerName(m)))) found.push(p)
    if (found.length >= 2) break
  }
  const positives: VerdictLine[] = []
  if (found.length > 0) {
    const title =
      found.length === 1
        ? found[0].fr
        : `${found[0].fr} et ${found[1].fr.charAt(0).toLowerCase()}${found[1].fr.slice(1)}`
    const who = skinWord && input.personalized ? `ta peau ${skinWord}` : 'ta peau'
    positives.push({
      title,
      detail: `${found.length === 1 ? 'Bon' : 'Bons'} pour ${found[0].does} ${who}`,
    })
  }

  const raw = typeof input.score === 'number' && Number.isFinite(input.score) ? input.score : null
  const score = raw === null ? null : applyColorCap(raw, counts.orange, counts.rouge)
  const scoreLabel = score === null ? null : scoreLabelFromScore(score)
  const tone = score === null ? null : toneForScore(score)
  const starTone = verdictToneFromScore(score)

  const kind: QuickVerdict['kind'] =
    alerts.length > 0 ? 'alerts' : score !== null && score >= 13 ? 'clean' : 'neutral'

  return {
    counts,
    starTone,
    scoreLabel,
    tone,
    alerts: alerts.slice(0, 2),
    positives,
    claims: detectClaims(input.productName),
    kind,
  }
}
