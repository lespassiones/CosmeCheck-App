/**
 * Analysis Runner — client mobile de l'analyse INCI.
 *
 * Appelle l'Edge Function Supabase `analyser` (le JWT est auto-attaché par
 * supabase-js). Mappe les paramètres mobile → contrat de la fonction, parse la
 * réponse, applique le post-traitement des restrictions utilisateur, puis
 * renvoie { analysisId, response }.
 *
 * Contrat fonction (aligné avec WORKSTREAM 1) :
 *   request  : { text, withSynthesis?, productLabel?, brand?, productType?,
 *                addToRoutine?, productEan? }
 *   response : AnalyseResponse + { analysisId, addedToRoutine }
 *   429 body : { error, credits: { used, limit, remaining } }
 *
 * Erreurs :
 *   - CreditExhaustedError (code CREDIT_EXHAUSTED) — crédits épuisés (HTTP 429)
 *   - NetworkError (code NETWORK_ERROR)            — échec réseau / fetch
 *   - ApiError (code API_ERROR, status)            — autre réponse non-2xx
 */

import { supabase, db } from '../supabase/client'
import { parseAnalyseResponse as parseAnalyseResponseSafe } from './types'
import type { AnalyseItem, AnalyseResponse } from './types'
import type { UserRestrictions, AnalysisRow } from '../supabase/types'
import { bumpScanCount } from '../notifications/optInStorage'

// ─── Types publics ──────────────────────────────────────────────────────────

export interface RunAnalysisParams {
  inciInput: string
  productName?: string
  brand?: string
  barcode?: string
  /** URL source du produit (ex: page e-commerce d'origine). */
  sourceUrl?: string
  source: 'barcode' | 'ocr' | 'search' | 'manual' | 'link'
  userId: string
  userRestrictions?: UserRestrictions
  /** Si `true`, génère la synthèse pendant l'analyse initiale (coûteux).
   *  Défaut: false. La synthèse est générée à la demande via l'Edge Function
   *  `synthesis` quand l'utilisateur ouvre l'analyse complète. */
  withSynthesis?: boolean
  /** Ajoute directement le produit à la routine côté serveur. */
  addToRoutine?: boolean
  /** Type de produit (hint pour la catégorisation serveur). */
  productType?: string
}

/** Item enrichi côté client avec le flag de restriction utilisateur. */
export type AnalyseItemWithRestriction = AnalyseItem & { is_restricted?: boolean }

/** Réponse enrichie : items porteurs du flag `is_restricted`. */
export type AnalyseResponseWithRestrictions = Omit<AnalyseResponse, 'items'> & {
  items: AnalyseItemWithRestriction[]
  /** Présent si la fonction a ajouté le produit à la routine. */
  addedToRoutine?: boolean
}

export interface RunAnalysisResult {
  analysisId: string
  response: AnalyseResponseWithRestrictions
}

/** Payload crédits renvoyé par la fonction en cas de 429. */
export interface CreditsPayload {
  used: number
  limit: number
  remaining: number
}

// ─── Erreurs custom ───────────────────────────────────────────────────────────

export class CreditExhaustedError extends Error {
  readonly code = 'CREDIT_EXHAUSTED' as const
  readonly credits: CreditsPayload | null
  constructor(message = 'Crédits épuisés', credits: CreditsPayload | null = null) {
    super(message)
    this.name = 'CreditExhaustedError'
    this.credits = credits
  }
}

export class NetworkError extends Error {
  readonly code = 'NETWORK_ERROR' as const
  constructor(message = 'Connexion impossible') {
    super(message)
    this.name = 'NetworkError'
  }
}

export class ApiError extends Error {
  readonly code = 'API_ERROR' as const
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

// ─── Helpers internes ──────────────────────────────────────────────────────────

/** Lit le corps JSON d'une Response sans throw. */
async function readJsonBody(res: Response | undefined | null): Promise<Record<string, unknown> | null> {
  if (!res || typeof res.json !== 'function') return null
  try {
    const json = await res.json()
    return json && typeof json === 'object' ? (json as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** Extrait un payload crédits {used,limit,remaining} d'un corps brut. */
function extractCredits(body: Record<string, unknown> | null): CreditsPayload | null {
  if (!body) return null
  const raw = body.credits
  if (!raw || typeof raw !== 'object') return null
  const c = raw as Record<string, unknown>
  if (
    typeof c.used !== 'number' ||
    typeof c.limit !== 'number' ||
    typeof c.remaining !== 'number'
  ) {
    return null
  }
  return { used: c.used, limit: c.limit, remaining: c.remaining }
}

/**
 * Post-traitement : marque `is_restricted = true` sur chaque item dont le nom
 * INCI contient un terme d'allergie utilisateur, ou dont une fonction
 * appartient à une famille à éviter.
 *
 * - Allergies freeform (ingredients[].name) → découpées par virgule en termes.
 * - Familles (restrictions.families) → comparées aux fonctions de l'item.
 */
/** minuscule + sans accents + espaces compactés (matching robuste des INCI). */
function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function applyRestrictions(
  response: AnalyseResponse,
  restrictions: UserRestrictions | undefined,
  /**
   * Noms INCI membres des familles évitées (résolus via la RPC
   * `cosme_check_get_family_ingredient_names`). INDISPENSABLE pour détecter une
   * famille comme « silicones » : ses ingrédients (Dimethicone…) ne portent pas
   * le mot « silicone » dans leur nom ni dans leur fonction.
   */
  familyIngredientNames: string[] = [],
): AnalyseResponseWithRestrictions {
  const items = response.items as AnalyseItemWithRestriction[]
  if (!restrictions) {
    return { ...response, items }
  }

  // Termes d'allergie : noms d'ingrédients restreints éclatés par virgule.
  const allergyTerms = restrictions.ingredients
    .flatMap((ing) => (ing?.name ?? '').split(','))
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0)

  // Slugs d'ingrédients explicitement restreints (match exact).
  const restrictedSlugs = new Set(
    restrictions.ingredients
      .map((ing) => (ing?.slug ?? '').trim().toLowerCase())
      .filter((s) => s.length > 0),
  )

  // Familles à éviter (comparées aux fonctions de l'item — historique, faible
  // portée mais sans risque de faux positif).
  const familyTerms = restrictions.families
    .map((f) => f.trim().toLowerCase())
    .filter((f) => f.length > 0)

  // Noms INCI membres des familles évitées (match exact, normalisé). C'est le
  // vrai mécanisme : on attrape Dimethicone & co quand « silicones » est coché.
  const familyMemberNames = new Set(
    familyTerms.length > 0
      ? familyIngredientNames.map((n) => normalizeName(n)).filter((n) => n.length > 0)
      : [],
  )

  const markedItems: AnalyseItemWithRestriction[] = items.map((item) => {
    const rawName = item.name ?? ''
    const name = rawName.toLowerCase()
    const slug = (item.slug ?? '').toLowerCase()
    const functions = [
      item.primaryFunction,
      ...(item.allFunctions ?? []),
    ]
      .filter((f): f is string => typeof f === 'string')
      .map((f) => f.toLowerCase())

    const byName = allergyTerms.some((term) => name.includes(term))
    const bySlug = slug.length > 0 && restrictedSlugs.has(slug)
    const byFamily = functions.some((fn) =>
      familyTerms.some((fam) => fn.includes(fam)),
    )
    const byFamilyMember =
      familyMemberNames.size > 0 && familyMemberNames.has(normalizeName(rawName))

    if (byName || bySlug || byFamily || byFamilyMember) {
      return { ...item, is_restricted: true }
    }
    return item
  })

  return { ...response, items: markedItems }
}

// ─── parseAnalyseResponse ────────────────────────────────────────────────────

/**
 * Valide et cast le JSON brut de l'API vers AnalyseResponse typé.
 * S'appuie sur le parseur défensif de `types.ts`. Throw ApiError(502) si le
 * format est invalide (réponse serveur inattendue).
 */
export function parseAnalyseResponse(json: unknown): AnalyseResponse {
  const parsed = parseAnalyseResponseSafe(json)
  if (!parsed) {
    throw new ApiError('Réponse du serveur invalide', 502)
  }
  return parsed
}

// ─── runAnalysis ──────────────────────────────────────────────────────────────

export async function runAnalysis(params: RunAnalysisParams): Promise<RunAnalysisResult> {
  const {
    inciInput,
    productName,
    brand,
    barcode,
    sourceUrl,
    // Par défaut on NE GÉNÈRE PAS la synthèse pendant l'analyse initiale.
    // Elle est générée à la demande quand l'utilisateur clique "Voir l'analyse
    // complète" (Edge Function `synthesis` séparée, persiste dans la row).
    // Ça réduit la latence de l'analyse initiale et évite un coût LLM pour
    // les utilisateurs qui ne déplient jamais le détail.
    withSynthesis = false,
    addToRoutine,
    productType,
    userRestrictions,
  } = params

  // Corps aligné sur le contrat de l'Edge Function `analyser`.
  const body: Record<string, unknown> = {
    text: inciInput,
    withSynthesis,
  }
  if (productName) body.productLabel = productName
  if (brand) body.brand = brand
  if (productType) body.productType = productType
  if (addToRoutine != null) body.addToRoutine = addToRoutine
  if (barcode) body.productEan = barcode
  if (sourceUrl) body.sourceUrl = sourceUrl

  // Timeout dur : si l'Edge stalle, on coupe au lieu de laisser l'overlay
  // tourner indéfiniment (parité avec le web qui abort à 10 s ; 20 s ici car
  // le pipeline complet mobile peut être plus long à froid).
  const abort = new AbortController()
  const timeoutId = setTimeout(() => abort.abort(), 20_000)
  let data, error, response
  try {
    ;({ data, error, response } = await supabase.functions.invoke('analyser', {
      body,
      signal: abort.signal,
    }))
  } catch (e) {
    if (abort.signal.aborted) throw new NetworkError()
    throw e
  } finally {
    clearTimeout(timeoutId)
  }

  if (error) {
    // Timeout local → même traitement qu'un échec réseau (bouton Réessayer).
    if (abort.signal.aborted) {
      throw new NetworkError()
    }
    // Échec réseau (fetch) → NetworkError.
    if (error.name === 'FunctionsFetchError') {
      throw new NetworkError()
    }

    // Réponse non-2xx → lire le statut + corps pour distinguer 429 vs autres.
    // `response` (ou error.context) porte la Response brute.
    const res: Response | undefined =
      response ?? ((error as { context?: Response }).context as Response | undefined)
    const status = res?.status ?? 0
    const errorBody = await readJsonBody(res)

    if (status === 429) {
      const credits = extractCredits(errorBody)
      const msg =
        (errorBody && typeof errorBody.error === 'string' && errorBody.error) ||
        'Crédits épuisés'
      throw new CreditExhaustedError(msg, credits)
    }

    if (status > 0) {
      const msg =
        (errorBody && typeof errorBody.error === 'string' && errorBody.error) ||
        (error instanceof Error ? error.message : 'Erreur du serveur')
      throw new ApiError(msg, status)
    }

    // Pas de statut exploitable → on retombe sur réseau.
    throw new NetworkError()
  }

  // Parse + validation du format.
  const parsed = parseAnalyseResponse(data)

  // analysisId / addedToRoutine sont des extras hors AnalyseResponse.
  const extras = (data ?? {}) as Record<string, unknown>
  const analysisId =
    typeof extras.analysisId === 'string' ? extras.analysisId : ''
  if (!analysisId) {
    throw new ApiError("L'analyse n'a pas retourné d'identifiant", 502)
  }
  const addedToRoutine =
    typeof extras.addedToRoutine === 'boolean' ? extras.addedToRoutine : undefined

  // Post-traitement restrictions utilisateur (marque is_restricted).
  const withRestrictions = applyRestrictions(parsed, userRestrictions)
  const enriched: AnalyseResponseWithRestrictions = {
    ...withRestrictions,
    addedToRoutine,
  }

  // Compteur de scans réussis (re-demande d'opt-in notifications au 2e scan).
  void bumpScanCount()

  return { analysisId, response: enriched }
}

// ─── getAnalysisById / deleteAnalysis ────────────────────────────────────────

/** Récupère une analyse depuis `cosme_check.analyses` par son ID. */
export async function getAnalysisById(id: string): Promise<AnalysisRow | null> {
  const { data, error } = await db()
    .from('analyses')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return (data as AnalysisRow | null) ?? null
}

/** Supprime une analyse de l'historique. */
export async function deleteAnalysis(id: string): Promise<void> {
  const { error } = await db().from('analyses').delete().eq('id', id)
  if (error) throw error
}
