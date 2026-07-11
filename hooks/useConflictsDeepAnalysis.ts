/**
 * useConflictsDeepAnalysis — analyse IA approfondie des conflits de routine
 * (Edge `routine-conflicts-ai`), en NUANCE par-dessus le socle déterministe.
 *
 * QUOI :
 *   1. Construit une projection COMPACTE de la routine (jamais le result_json
 *      complet) : par produit, ses signaux notables (slugs classifiés + tags
 *      alcool/huile essentielle/filtre UV + allergènes UE), bornés à 12.
 *   2. Calcule une signature stable (stableHash d'un JSON trié) et consulte le
 *      cache LOCAL (7 j) : un hit affiche le résultat SANS réseau ni crédit.
 *   3. Miss -> invoque l'Edge (1 crédit débité côté serveur après miss cache
 *      serveur). Un 429 (crédits épuisés) -> toast + redirection paywall.
 *   4. Succès -> écrit le cache local + invalide la pilule crédits.
 *
 * Le state (loading / results / error) est possédé ici et injecté dans la sheet.
 */
import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'

import { showToast } from '@/components/shared/Toast'
import { supabase } from '@/lib/supabase/client'
import { ROUTES } from '@/constants/routes'
import {
  readAiCache,
  stableHash,
  writeAiCache,
  TTL_ROUTINE_CONFLICTS_MS,
} from '@/lib/storage/aiCache'
import { skinContextSummary, type SkinProfile } from '@/lib/skin/profile'
import {
  ALCOHOL_TAG,
  ESSENTIAL_OIL_TAG,
  UV_FILTER_TAGS,
  classifyItem,
} from '@/lib/inci/activesDictionary'
import type { ConflictInput, RoutineConflict } from '@/lib/routine/conflicts'
import type { AiConflict } from '@/components/routine/ConflictsSheet'

const AI_NAMESPACE = 'routine-conflicts'
const MAX_SIGNALS = 12

/** Résultat exposé (forme consommée par la sheet). */
export interface DeepAnalysisResult {
  conflicts: AiConflict[]
  note: string | null
}

export interface UseConflictsDeepAnalysisResult {
  loading: boolean
  results: DeepAnalysisResult | null
  error: string | null
  run: (
    inputs: ConflictInput[],
    deterministic: RoutineConflict[],
    profile: SkinProfile,
  ) => Promise<void>
  reset: () => void
}

/** Tags notables transmis à l'IA (préfixés `tag:` pour éviter les collisions). */
const NOTABLE_TAGS: readonly string[] = [ALCOHOL_TAG, ESSENTIAL_OIL_TAG, ...UV_FILTER_TAGS]

/** Signaux compacts d'un produit : slugs classifiés + tags notables + allergènes. */
function buildSignals(input: ConflictInput): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const add = (s: string): void => {
    if (out.length >= MAX_SIGNALS || seen.has(s)) return
    seen.add(s)
    out.push(s)
  }
  for (const it of input.items) {
    if (it.slug && classifyItem(it.slug, it.tags).length > 0) add(it.slug)
  }
  const tagSet = new Set<string>()
  for (const it of input.items) {
    for (const t of (Array.isArray(it.tags) ? it.tags : [])) {
      if (NOTABLE_TAGS.includes(t)) tagSet.add(t)
    }
  }
  for (const t of tagSet) add(`tag:${t}`)
  for (const a of input.euAllergens?.detected ?? []) add(`allergene:${a.label}`)
  return out
}

type ProjectionProduct = {
  name: string
  category: string | null
  categoryPrecise: string | null
  timeOfDay: 'morning' | 'evening' | 'both' | null
  frequency: 'daily' | 'weekly' | 'monthly'
  signals: string[]
}

function byName(a: { name: string }, b: { name: string }): number {
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0
}

function byRuleId(a: { ruleId: string }, b: { ruleId: string }): number {
  return a.ruleId < b.ruleId ? -1 : a.ruleId > b.ruleId ? 1 : 0
}

/** Parse défensif de la réponse Edge (déjà nettoyée serveur) vers la forme UI. */
function parseEdgeResult(data: unknown): DeepAnalysisResult {
  if (!data || typeof data !== 'object') return { conflicts: [], note: null }
  const r = data as Record<string, unknown>
  const listRaw = Array.isArray(r.additional_conflicts) ? r.additional_conflicts : []
  const conflicts: AiConflict[] = []
  for (const raw of listRaw as unknown[]) {
    if (!raw || typeof raw !== 'object') continue
    const c = raw as Record<string, unknown>
    conflicts.push({
      title: typeof c.title === 'string' ? c.title : '',
      explanation: typeof c.explanation === 'string' ? c.explanation : '',
      tip: typeof c.tip === 'string' ? c.tip : '',
      severity: c.severity === 'medium' ? 'medium' : 'info',
      products: Array.isArray(c.products)
        ? (c.products as unknown[]).filter((p): p is string => typeof p === 'string')
        : [],
    })
  }
  const note = typeof r.overall_note === 'string' && r.overall_note.trim().length > 0
    ? r.overall_note
    : null
  return { conflicts, note }
}

export function useConflictsDeepAnalysis(): UseConflictsDeepAnalysisResult {
  const qc = useQueryClient()
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<DeepAnalysisResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reset = useCallback(() => {
    setLoading(false)
    setResults(null)
    setError(null)
  }, [])

  const run = useCallback(
    async (
      inputs: ConflictInput[],
      deterministic: RoutineConflict[],
      profile: SkinProfile,
    ): Promise<void> => {
      if (loading) return
      setLoading(true)
      setError(null)

      const products: ProjectionProduct[] = inputs
        .map((i) => ({
          name: i.name,
          category: i.category,
          categoryPrecise: i.categoryPrecise,
          timeOfDay: i.timeOfDay,
          frequency: i.frequency,
          signals: buildSignals(i).sort(),
        }))
        .sort(byName)

      const deterministicFindings = deterministic
        .map((c) => ({ ruleId: c.ruleId, title: c.title }))
        .sort(byRuleId)

      const profileSummary = skinContextSummary(profile)

      const signature = stableHash(
        JSON.stringify({ products, profileSummary, findings: deterministicFindings }),
      )

      try {
        // ── Cache local (7 j) : hit = 0 réseau, 0 crédit ────────────────────
        const cached = await readAiCache<DeepAnalysisResult>(
          AI_NAMESPACE,
          signature,
          TTL_ROUTINE_CONFLICTS_MS,
        )
        if (cached) {
          setResults(cached)
          return
        }

        const { data, error: fnError } = await supabase.functions.invoke(
          'routine-conflicts-ai',
          { body: { products, profileSummary, deterministicFindings } },
        )

        if (fnError) {
          // FunctionsHttpError expose la Response d'origine dans `context`.
          const ctx = (fnError as { context?: { status?: number } }).context
          if (ctx?.status === 429) {
            showToast('Crédits épuisés pour aujourd’hui.', 'info')
            router.push(ROUTES.OFFRE.INDEX)
            return
          }
          setError('Analyse approfondie indisponible. Réessaie.')
          return
        }

        // Un body { code: 'no_credits' } peut passer sans fnError selon le SDK.
        const code = (data as { code?: unknown } | null)?.code
        if (code === 'no_credits') {
          showToast('Crédits épuisés pour aujourd’hui.', 'info')
          router.push(ROUTES.OFFRE.INDEX)
          return
        }

        const parsed = parseEdgeResult(data)
        setResults(parsed)
        await writeAiCache(AI_NAMESPACE, signature, parsed)
        void qc.invalidateQueries({ queryKey: ['credits'] })
      } catch {
        setError('Analyse approfondie indisponible. Réessaie.')
      } finally {
        setLoading(false)
      }
    },
    [loading, qc],
  )

  return { loading, results, error, run, reset }
}
