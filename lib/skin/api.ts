/**
 * Score de peau : couche I/O Supabase (impure).
 *
 * Accès DB direct via `db()` sur les tables `cosme_check.skin_checkins` et
 * `cosme_check.face_scans` (RLS owner-scoped, pattern `routine_items`). Les
 * INSERT de `face_scans` restent réservés au service role (Edge Function
 * `face-analyze`) ; côté client on ne fait que SELECT/DELETE. Le calcul des
 * scores d'un check-in est délégué aux fonctions PURES de `lib/skin/score.ts`.
 *
 * Les deux tables ne sont pas (encore) dans les types générés Supabase : on
 * passe donc par un accès faiblement typé local (`skinFrom`) et on valide/coerce
 * les lignes à la main pour garder un contrat strict côté app.
 */

import { DeviceEventEmitter } from 'react-native'

import { db, supabase } from '@/lib/supabase/client'
import {
  SKIN_DIMENSIONS,
  answersToScores,
  globalScore,
  type DimScores,
} from '@/lib/skin/score'
import { CREDITS_EXHAUSTED_EVENT } from '@/lib/credits/exhaustedStore'

// ── Types de lignes ────────────────────────────────────────────────────────

export type CheckinRow = {
  id: string
  week_key: string
  answers: number[]
  scores: DimScores
  score: number
  created_at: string
}

export type FaceScanRow = {
  id: string
  photo_path: string
  metrics: DimScores
  score: number
  created_at: string
}

/** Réponse du contrat Edge `face-analyze` (partagée avec l'agent capture visage). */
export type FaceAnalyzeResult = {
  ok: boolean
  scanId?: string
  metrics?: DimScores
  score?: number
  quality: { ok: boolean; reasons?: string[] }
  alreadyAnalyzed?: boolean
  credits?: { used: number; limit: number; remaining: number }
}

/** Erreur typée levée par `invokeFaceAnalyze` quand les crédits sont épuisés (429/no_credits). */
export class FaceAnalyzeNoCreditError extends Error {
  credits?: { used: number; limit: number; remaining: number }
  constructor(credits?: { used: number; limit: number; remaining: number }) {
    super('Crédits épuisés')
    this.name = 'FaceAnalyzeNoCreditError'
    this.credits = credits
  }
}

// ── Accès faiblement typé (tables hors types générés) ───────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function skinFrom(table: 'skin_checkins' | 'face_scans'): any {
  // db() est typé sur le schéma généré ; ces deux tables n'y figurent pas encore.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (db() as any).from(table)
}

// ── Coercition défensive ─────────────────────────────────────────────────────

function coerceDims(raw: unknown): DimScores {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const out = {} as DimScores
  for (const dim of SKIN_DIMENSIONS) {
    const v = src[dim]
    out[dim] = typeof v === 'number' && Number.isFinite(v) ? v : 0
  }
  return out
}

function coerceAnswers(raw: unknown): number[] {
  if (!Array.isArray(raw)) return []
  return raw.map((v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0))
}

function coerceNumber(raw: unknown): number {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : 0
}

function toCheckinRow(raw: Record<string, unknown>): CheckinRow {
  return {
    id: String(raw.id),
    week_key: String(raw.week_key ?? ''),
    answers: coerceAnswers(raw.answers),
    scores: coerceDims(raw.scores),
    score: coerceNumber(raw.score),
    created_at: String(raw.created_at ?? ''),
  }
}

function toFaceScanRow(raw: Record<string, unknown>): FaceScanRow {
  return {
    id: String(raw.id),
    photo_path: String(raw.photo_path ?? ''),
    metrics: coerceDims(raw.metrics),
    score: coerceNumber(raw.score),
    created_at: String(raw.created_at ?? ''),
  }
}

// ── Lectures ─────────────────────────────────────────────────────────────────

/** Check-ins hebdo de l'utilisateur, triés par date croissante (RLS owner-scoped). */
export async function fetchCheckins(): Promise<CheckinRow[]> {
  const { data, error } = await skinFrom('skin_checkins')
    .select('id,week_key,answers,scores,score,created_at')
    .order('created_at', { ascending: true })
  if (error) throw error
  return ((data as Record<string, unknown>[] | null) ?? []).map(toCheckinRow)
}

/** Scans visage de l'utilisateur, triés par date croissante (RLS owner-scoped). */
export async function fetchFaceScans(): Promise<FaceScanRow[]> {
  const { data, error } = await skinFrom('face_scans')
    .select('id,photo_path,metrics,score,created_at')
    .order('created_at', { ascending: true })
  if (error) throw error
  return ((data as Record<string, unknown>[] | null) ?? []).map(toFaceScanRow)
}

// ── Écritures ─────────────────────────────────────────────────────────────────

/**
 * Enregistre (ou met à jour) le bilan hebdo de la semaine ISO `weekKey`.
 * Les scores/global sont recalculés côté client via les fonctions pures.
 * Upsert sur la contrainte UNIQUE (user_id, week_key).
 */
export async function upsertCheckin(
  userId: string,
  weekKey: string,
  answers: number[],
): Promise<CheckinRow> {
  const scores = answersToScores(answers)
  const score = globalScore(scores)
  const { data, error } = await skinFrom('skin_checkins')
    .upsert(
      {
        user_id: userId,
        week_key: weekKey,
        answers,
        scores,
        score,
      },
      { onConflict: 'user_id,week_key' },
    )
    .select('id,week_key,answers,scores,score,created_at')
    .single()
  if (error) throw error
  return toCheckinRow(data as Record<string, unknown>)
}

// ── Storage (photos privées) ──────────────────────────────────────────────────

/** URL signée (1 h) pour une photo du bucket privé `skin-photos`. null si échec. */
export async function signedPhotoUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from('skin-photos')
    .createSignedUrl(path, 3600)
  if (error || !data?.signedUrl) return null
  return data.signedUrl
}

/**
 * Supprime un scan visage (ligne + fichier storage best-effort).
 * La ligne part en premier (autorisée par RLS) ; le remove storage est tenté
 * ensuite mais son échec n'invalide pas la suppression logique.
 */
export async function deleteFaceScan(id: string, photoPath: string): Promise<void> {
  const { error } = await skinFrom('face_scans').delete().eq('id', id)
  if (error) throw error
  try {
    await supabase.storage.from('skin-photos').remove([photoPath])
  } catch {
    // best-effort : la ligne est déjà supprimée, le fichier orphelin sera purgé côté serveur.
  }
}

// ── Edge Function face-analyze ─────────────────────────────────────────────────

function isNoCredit(status: number, body: unknown): boolean {
  if (status === 429) return true
  if (body && typeof body === 'object') {
    const code = (body as Record<string, unknown>).code
    if (code === 'no_credits') return true
  }
  return false
}

function extractCredits(
  body: unknown,
): { used: number; limit: number; remaining: number } | undefined {
  if (!body || typeof body !== 'object') return undefined
  const c = (body as Record<string, unknown>).credits
  if (!c || typeof c !== 'object') return undefined
  const r = c as Record<string, unknown>
  return {
    used: coerceNumber(r.used),
    limit: coerceNumber(r.limit),
    remaining: coerceNumber(r.remaining),
  }
}

async function readJsonBody(res: Response | undefined): Promise<unknown> {
  if (!res) return null
  try {
    return await res.json()
  } catch {
    return null
  }
}

/**
 * Envoie une photo (base64, sans préfixe data-uri idéalement) à l'Edge Function
 * `face-analyze`. En cas de 429 / `no_credits`, émet `CREDITS_EXHAUSTED_EVENT`
 * (modale globale) et lève `FaceAnalyzeNoCreditError`. Sinon renvoie le corps
 * parsé (succès OU rejet qualité `{ ok:false }`, tous deux sans débit côté
 * serveur pour le rejet qualité).
 */
export async function invokeFaceAnalyze(base64: string): Promise<FaceAnalyzeResult> {
  const { data, error, response } = await supabase.functions.invoke('face-analyze', {
    body: { image: base64, mimeType: 'image/jpeg' },
  })

  if (error) {
    const res: Response | undefined =
      response ?? ((error as { context?: Response }).context as Response | undefined)
    const status = res?.status ?? 0
    const body = await readJsonBody(res)

    if (isNoCredit(status, body)) {
      const credits = extractCredits(body)
      if (credits) {
        DeviceEventEmitter.emit(CREDITS_EXHAUSTED_EVENT, {
          used: credits.used,
          limit: credits.limit,
        })
      } else {
        DeviceEventEmitter.emit(CREDITS_EXHAUSTED_EVENT, {})
      }
      throw new FaceAnalyzeNoCreditError(credits)
    }

    const msg =
      (body && typeof body === 'object' && typeof (body as Record<string, unknown>).error === 'string'
        ? ((body as Record<string, unknown>).error as string)
        : null) ?? (error instanceof Error ? error.message : "Échec de l'analyse")
    throw new Error(msg)
  }

  return (data ?? { ok: false, quality: { ok: false } }) as FaceAnalyzeResult
}
