/**
 * Feuille PURE (ZÉRO import, zéro global Deno) de l'Edge `routine-conflicts-ai`.
 *
 * QUOI : valide/normalise la requête entrante (caps produits + signaux),
 * fabrique une graine de cache stable (indépendante de l'ordre) et parse de
 * façon DÉFENSIVE la sortie du modèle.
 *
 * POURQUOI : isoler toute la logique déterministe testable par ts-jest (import
 * relatif, comme coherenceAbsenceGuard), et garantir qu'aucune sortie modèle ne
 * contient de tiret cadratin (U+2014) ni de score produit /20. La sévérité
 * `high` reste RÉSERVÉE au moteur déterministe : le modèle ne peut émettre que
 * `medium`/`info` (toute autre valeur est coercée en `info`).
 */

export type AiSeverity = 'medium' | 'info'

export type AiConflict = {
  title: string
  explanation: string
  tip: string
  severity: AiSeverity
  products: string[]
}

export type DeepCheckProduct = {
  name: string
  category: string | null
  categoryPrecise: string | null
  timeOfDay: 'morning' | 'evening' | 'both' | null
  frequency: 'daily' | 'weekly' | 'monthly'
  signals: string[]
}

export type DeepCheckRequest = {
  products: DeepCheckProduct[]
  profileSummary: string | null
  deterministicFindings: { ruleId: string; title: string }[]
}

export const MAX_PRODUCTS = 15
export const MAX_SIGNALS = 12
export const MAX_AI_CONFLICTS = 5

const MAX_NAME = 120
const MAX_TITLE = 120
const MAX_EXPLANATION = 400
const MAX_TIP = 200
const MAX_NOTE = 400

// Tiret cadratin construit sans jamais écrire le caractère dans la source.
const EM_DASH = String.fromCharCode(0x2014)

/** Motif d'un score numérique /20 (ex. "14/20", "14 / 20"). */
const SCORE_20_RE = /\d+\s*\/\s*20/

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v)
}

function toStringOrNull(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  if (t.length === 0) return null
  return t.slice(0, max)
}

function coerceTimeOfDay(v: unknown): DeepCheckProduct['timeOfDay'] {
  if (v === 'morning' || v === 'evening' || v === 'both') return v
  return null
}

function coerceFrequency(v: unknown): DeepCheckProduct['frequency'] {
  if (v === 'daily' || v === 'weekly' || v === 'monthly') return v
  return 'daily'
}

/**
 * Nettoie un texte modèle : remplace tout U+2014 par ', ', retire les phrases
 * mentionnant un score /20, compacte les espaces, tronque.
 */
function sanitizeText(raw: unknown, max: number): string {
  if (typeof raw !== 'string') return ''
  const noDash = raw.split(EM_DASH).join(', ')
  // Découpe naïve en phrases (garde la ponctuation), retire celles avec un /20.
  const sentences = noDash.split(/(?<=[.!?])\s+/)
  const kept = sentences.filter((s) => !SCORE_20_RE.test(s))
  const joined = (kept.length > 0 ? kept.join(' ') : '')
    .replace(/\s+/g, ' ')
    .trim()
  return joined.slice(0, max)
}

/** Valide et normalise la requête HTTP. Retourne null si la forme est invalide. */
export function validateDeepCheckRequest(body: unknown): DeepCheckRequest | null {
  if (!isPlainObject(body)) return null
  if (!Array.isArray(body.products)) return null

  const products: DeepCheckProduct[] = []
  for (const rawP of body.products as unknown[]) {
    if (products.length >= MAX_PRODUCTS) break
    if (!isPlainObject(rawP)) continue
    const name = toStringOrNull(rawP.name, MAX_NAME)
    if (!name) continue
    const signalsRaw = Array.isArray(rawP.signals) ? (rawP.signals as unknown[]) : []
    const signals: string[] = []
    for (const s of signalsRaw) {
      if (signals.length >= MAX_SIGNALS) break
      if (typeof s === 'string' && s.trim().length > 0) signals.push(s.trim().slice(0, 80))
    }
    products.push({
      name,
      category: toStringOrNull(rawP.category, 80),
      categoryPrecise: toStringOrNull(rawP.categoryPrecise, 80),
      timeOfDay: coerceTimeOfDay(rawP.timeOfDay),
      frequency: coerceFrequency(rawP.frequency),
      signals,
    })
  }

  const findingsRaw = Array.isArray(body.deterministicFindings)
    ? (body.deterministicFindings as unknown[])
    : []
  const deterministicFindings: { ruleId: string; title: string }[] = []
  for (const f of findingsRaw) {
    if (!isPlainObject(f)) continue
    const ruleId = toStringOrNull(f.ruleId, 80)
    const title = toStringOrNull(f.title, MAX_TITLE)
    if (ruleId && title) deterministicFindings.push({ ruleId, title })
  }

  return {
    products,
    profileSummary: toStringOrNull(body.profileSummary, 300),
    deterministicFindings,
  }
}

/**
 * Graine de cache STABLE : produits triés par nom, signaux triés, findings triés
 * par ruleId + profileSummary. Deux requêtes équivalentes (à permutation près)
 * produisent la même graine.
 */
export function buildCacheSeed(req: DeepCheckRequest): string {
  const products = [...req.products]
    .map((p) => ({
      name: p.name,
      category: p.category,
      categoryPrecise: p.categoryPrecise,
      timeOfDay: p.timeOfDay,
      frequency: p.frequency,
      signals: [...p.signals].sort(),
    }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  const findings = [...req.deterministicFindings].sort((a, b) =>
    a.ruleId < b.ruleId ? -1 : a.ruleId > b.ruleId ? 1 : 0,
  )
  return JSON.stringify({
    products,
    profileSummary: req.profileSummary,
    findings,
  })
}

/**
 * Parse DÉFENSIF de la sortie modèle. Toute forme invalide => structure vide.
 * Sévérité inconnue ou `high` => coercée `info` (le high reste déterministe).
 * Cap à MAX_AI_CONFLICTS. U+2014 remplacé, mentions /20 retirées.
 */
export function parseAiConflicts(raw: string): {
  additional_conflicts: AiConflict[]
  overall_note: string | null
} {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { additional_conflicts: [], overall_note: null }
  }
  if (!isPlainObject(parsed)) return { additional_conflicts: [], overall_note: null }

  const listRaw = Array.isArray(parsed.additional_conflicts)
    ? (parsed.additional_conflicts as unknown[])
    : []
  const additional_conflicts: AiConflict[] = []
  for (const rawC of listRaw) {
    if (additional_conflicts.length >= MAX_AI_CONFLICTS) break
    if (!isPlainObject(rawC)) continue
    const title = sanitizeText(rawC.title, MAX_TITLE)
    const explanation = sanitizeText(rawC.explanation, MAX_EXPLANATION)
    const tip = sanitizeText(rawC.tip, MAX_TIP)
    if (!title && !explanation) continue
    const severity: AiSeverity = rawC.severity === 'medium' ? 'medium' : 'info'
    const products: string[] = Array.isArray(rawC.products)
      ? (rawC.products as unknown[])
          .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
          .map((p) => p.trim().slice(0, MAX_NAME))
      : []
    additional_conflicts.push({ title, explanation, tip, severity, products })
  }

  const noteRaw = sanitizeText(parsed.overall_note, MAX_NOTE)
  return {
    additional_conflicts,
    overall_note: noteRaw.length > 0 ? noteRaw : null,
  }
}
