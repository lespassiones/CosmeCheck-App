/**
 * Pure — normalise la routine utilisateur consommée par le system prompt de
 * `advisor-chat`. Accepte 2 formes :
 *   A) Rows de la RPC `cosme_check_get_routine_tags` (plate)
 *   B) Rows embed legacy `{ frequency, analyses: { ..., result_json } }`
 *
 * Pas de dépendance Deno ici : ce fichier est consommé par l'Edge Function ET
 * par les tests Jest (env node) — voir lib/__tests__/advisorRoutineNormalize.test.ts.
 */

export interface RoutineFact {
  name: string
  score: number | null
  frequency: string
  tags: string[]
}

interface LegacyAnalyseRow {
  name?: string | null
  product_label?: string | null
  score?: number | null
  result_json?: { items?: { tags?: string[] | null }[] } | null
}

const MAX_FACTS = 12
const MAX_TAGS = 6

export function normalizeRoutineRows(raw: unknown): RoutineFact[] {
  if (!Array.isArray(raw)) return []
  const out: RoutineFact[] = []
  for (const r of raw as Record<string, unknown>[]) {
    if (!r || typeof r !== 'object') continue

    // ── Forme A : RPC plate ──────────────────────────────────────────
    if (Array.isArray((r as { tags?: unknown }).tags)) {
      const tagsRaw = (r as { tags: unknown[] }).tags
      const tags = tagsRaw.filter((t): t is string => typeof t === 'string')
      out.push({
        name:
          (typeof r.product_label === 'string' && r.product_label) ||
          (typeof r.name === 'string' && r.name) ||
          'Analyse',
        score: typeof r.score === 'number' ? r.score : null,
        frequency: typeof r.frequency === 'string' ? r.frequency : 'daily',
        tags: tags.slice(0, MAX_TAGS),
      })
      continue
    }

    // ── Forme B : embed legacy avec result_json ──────────────────────
    const analyses = (r as { analyses?: LegacyAnalyseRow | null }).analyses
    if (!analyses) continue
    const tags = new Set<string>()
    for (const it of analyses.result_json?.items ?? []) {
      for (const t of it.tags ?? []) tags.add(t)
    }
    out.push({
      name: analyses.product_label ?? analyses.name ?? 'Analyse',
      score: typeof analyses.score === 'number' ? analyses.score : null,
      frequency: typeof r.frequency === 'string' ? r.frequency : 'daily',
      tags: Array.from(tags).slice(0, MAX_TAGS),
    })
  }
  return out.slice(0, MAX_FACTS)
}
