/**
 * Parse STRICT de la sortie du modèle vision (Edge Function `face-analyze`).
 *
 * Module FEUILLE : zéro import, zéro global Deno, testé par ts-jest via un
 * import RELATIF (pattern coherenceAbsenceGuard.test.ts). L'enum des raisons
 * est une COPIE volontaire de celui de prompt.ts : la contrainte zéro import
 * prime sur le DRY (les deux copies sont verrouillées par le même test).
 *
 * Règles (design 2c) :
 *   - JSON invalide (ou non-objet) -> null (le handler répond 500 SANS débit) ;
 *   - quality.ok manquant ou non booléen -> null ;
 *   - ok:false : raisons filtrées sur l'enum fermé, doublons retirés ;
 *     si aucune raison valide ne survit, fallback ['cadrage'] ;
 *     les métriques sont IGNORÉES (metrics = null), le rejet reste valide ;
 *   - ok:true : les 5 métriques doivent être des nombres finis, sinon null ;
 *     chaque valeur est arrondie à l'entier et bornée à [0, 100]
 *     (convention 100 = idéal, identique à lib/skin/score.ts).
 */

export type QualityReason =
  | 'lunettes'
  | 'trop_sombre'
  | 'flou'
  | 'visage_absent'
  | 'visage_trop_loin'
  | 'cadrage'

/** Enum fermé des raisons de rejet (copie locale, voir en-tête). */
export const QUALITY_REASONS: readonly QualityReason[] = [
  'lunettes',
  'trop_sombre',
  'flou',
  'visage_absent',
  'visage_trop_loin',
  'cadrage',
]

/** 5 dimensions 0-100, 100 = idéal (miroir de lib/skin/score.ts DimScores). */
export type DimScores = {
  imperfections: number
  rougeurs: number
  secheresse: number
  brillance: number
  douceur: number
}

export type FaceAnalyzeParsed = {
  quality: { ok: boolean; reasons: QualityReason[] }
  metrics: DimScores | null
}

const DIMS: readonly (keyof DimScores)[] = [
  'imperfections',
  'rougeurs',
  'secheresse',
  'brillance',
  'douceur',
]

function clampScore(v: number): number {
  return Math.min(100, Math.max(0, Math.round(v)))
}

/** Retire d'éventuelles clôtures markdown (```json ... ```) par défense. */
function stripFences(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed.startsWith('```')) return trimmed
  return trimmed.replace(/^```[a-zA-Z]*\s*/, '').replace(/```\s*$/, '')
}

export function parseFaceAnalyzeOutput(raw: string): FaceAnalyzeParsed | null {
  if (typeof raw !== 'string' || raw.trim().length === 0) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(stripFences(raw))
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
  const obj = parsed as Record<string, unknown>

  const quality = obj['quality']
  if (typeof quality !== 'object' || quality === null || Array.isArray(quality)) return null
  const q = quality as Record<string, unknown>
  if (typeof q['ok'] !== 'boolean') return null

  if (q['ok'] === false) {
    const rawReasons = Array.isArray(q['reasons']) ? (q['reasons'] as unknown[]) : []
    const filtered: QualityReason[] = []
    for (const r of rawReasons) {
      if (
        typeof r === 'string' &&
        (QUALITY_REASONS as readonly string[]).includes(r) &&
        !filtered.includes(r as QualityReason)
      ) {
        filtered.push(r as QualityReason)
      }
    }
    return {
      quality: { ok: false, reasons: filtered.length > 0 ? filtered : ['cadrage'] },
      metrics: null,
    }
  }

  const metricsRaw = obj['metrics']
  if (typeof metricsRaw !== 'object' || metricsRaw === null || Array.isArray(metricsRaw)) {
    return null
  }
  const m = metricsRaw as Record<string, unknown>
  const metrics = {} as DimScores
  for (const dim of DIMS) {
    const v = m[dim]
    if (typeof v !== 'number' || !Number.isFinite(v)) return null
    metrics[dim] = clampScore(v)
  }
  return { quality: { ok: true, reasons: [] }, metrics }
}
