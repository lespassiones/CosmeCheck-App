/**
 * useAlternativesDeck — logique partagée du deck « Proposer de meilleures
 * alternatives » (Ma routine soin ET Produits du quotidien).
 *
 * Envoie les produits du bucket courant à l'Edge `routine-smart-suggest` (1
 * crédit par produit qualifié côté serveur), récupère les alternatives, et gère
 * le deck feuilletable (garder en favori / comparer / ouvrir l'alternative).
 *
 * La RÈGLE de qualification (quels produits méritent une alternative) est
 * appliquée CÔTÉ SERVEUR (orange|rouge -> toujours ; sinon jaune >> vert), pour
 * rester cohérente entre mobile et web et ne pas gaspiller de crédits.
 */

import { useCallback, useState } from 'react'
import { router } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'

import { ROUTES } from '@/constants/routes'
import { supabase, db } from '@/lib/supabase/client'
import { decodeHtml } from '@/lib/decodeHtml'
import { parseAnalyseResponse, type AnalyseResponse } from '@/lib/analysis/types'
import { applyRestrictions } from '@/lib/analysis/analyser'
import { applyColorCap } from '@/lib/analysis/scoreCap'
import { readAiCache, compareInsightsKey, TTL_COMPARE_INSIGHTS_MS } from '@/lib/storage/aiCache'
import { showToast } from '@/components/shared/Toast'
import { useAuth } from '@/hooks/useAuth'
import { useProfile } from '@/hooks/useProfile'
import { useKeepFavorite } from '@/hooks/useKeepFavorite'
import { useLaunchAlternative } from '@/hooks/useLaunchAlternative'
import type { DeckSuggestion } from '@/components/routine/SuggestionsDeck'
import type { RoutineItem } from '@/hooks/useRoutine'

function titleFor(item: RoutineItem): string {
  return decodeHtml(item.analysis?.product_label?.trim() || item.analysis?.name?.trim()) || 'Produit'
}

export interface UseAlternativesDeckResult {
  deckOpen: boolean
  deck: DeckSuggestion[]
  deckLoading: boolean
  keepingKey: string | null
  comparingKey: string | null
  keptKeys: Set<string>
  openSuggestions: () => Promise<void>
  handleKeep: (s: DeckSuggestion) => Promise<void>
  handleCompare: (s: DeckSuggestion) => Promise<void>
  handleOpenAlternative: (s: DeckSuggestion) => void
  closeDeck: () => void
}

export function useAlternativesDeck(items: RoutineItem[]): UseAlternativesDeckResult {
  const qc = useQueryClient()
  const { user } = useAuth()
  const { restrictions } = useProfile()
  const { keep, ensureAnalysisId } = useKeepFavorite()
  const { analyze: launchAlternative } = useLaunchAlternative()

  const [deckOpen, setDeckOpen] = useState(false)
  const [deck, setDeck] = useState<DeckSuggestion[]>([])
  const [deckLoading, setDeckLoading] = useState(false)
  const [keepingKey, setKeepingKey] = useState<string | null>(null)
  const [comparingKey, setComparingKey] = useState<string | null>(null)
  const [keptKeys, setKeptKeys] = useState<Set<string>>(new Set())

  const seedKept = useCallback(
    async (deckData: DeckSuggestion[]) => {
      try {
        const userId = user?.id
        if (!userId) {
          setKeptKeys(new Set())
          return
        }
        const { data } = await db()
          .from('analyses')
          .select('ean,name')
          .eq('user_id', userId)
          .eq('favori', true)
        const eans = new Set<string>()
        const names = new Set<string>()
        for (const r of (data as { ean: string | null; name: string | null }[] | null) ?? []) {
          if (r.ean) eans.add(String(r.ean))
          if (r.name) names.add(r.name.trim().toLowerCase())
        }
        const kept = new Set<string>()
        for (const s of deckData) {
          const e = s.alternative.ean
          const nm = s.alternative.name?.trim().toLowerCase()
          if ((e && eans.has(String(e))) || (nm && names.has(nm))) kept.add(s.key)
        }
        setKeptKeys(kept)
      } catch {
        setKeptKeys(new Set())
      }
    },
    [user?.id],
  )

  const openSuggestions = useCallback(async () => {
    if (deckLoading) return
    setDeckLoading(true)
    try {
      const reqItems = items
        .map((it) => {
          const a = it.analysis
          const parsed = a?.result_json ? parseAnalyseResponse(a.result_json) : null
          if (!parsed || !a?.id) return null
          const withR = applyRestrictions(parsed, restrictions) as AnalyseResponse
          const rItems = (Array.isArray(withR.items) ? withR.items : []) as { is_restricted?: boolean }[]
          const restrictedCount = rItems.filter((x) => x.is_restricted).length
          const counts = withR.counts ?? { vert: 0, jaune: 0, orange: 0, rouge: 0 }
          const score = typeof withR.score === 'number' ? withR.score : 20
          const cappedScore = applyColorCap(score, counts.orange ?? 0, counts.rouge ?? 0)
          return {
            analysisId: a.id,
            name: titleFor(it),
            ean: a.ean ?? null,
            category: a.category_precise ?? null,
            counts: {
              vert: counts.vert ?? 0,
              jaune: counts.jaune ?? 0,
              orange: counts.orange ?? 0,
              rouge: counts.rouge ?? 0,
            },
            cappedScore,
            restrictedCount,
          }
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)

      if (reqItems.length === 0) {
        showToast('Ajoute des produits pour recevoir des suggestions.', 'info')
        return
      }

      const { data, error } = await supabase.functions.invoke('routine-smart-suggest', {
        body: { items: reqItems },
      })
      if (error) {
        showToast('Suggestions indisponibles. Réessaie.', 'error')
        return
      }
      void qc.invalidateQueries({ queryKey: ['credits'] })

      type AltOut = {
        ean: string
        brand: string | null
        name: string | null
        image_url: string | null
        score: number
        score_label: string
        score_tone: string
        ingredients_text: string | null
      }
      type SuggestionOut = {
        analysisId: string
        productName: string
        productScore: number | null
        productImageUrl: string | null
        dangerColor: 'rouge' | 'orange' | null
        alternative: AltOut | null
        reason: string | null
        locked: boolean
      }
      const resp = (data ?? {}) as { suggestions?: SuggestionOut[]; aiUnavailable?: boolean }
      const suggestions = resp.suggestions ?? []
      const withAlt = suggestions.filter((s) => s.alternative)
      const anyLocked = suggestions.some((s) => s.locked)

      if (withAlt.length === 0) {
        if (anyLocked) {
          // Des produits méritaient une suggestion mais les crédits sont épuisés
          // (le serveur n'a lancé AUCUNE IA : vérification du solde en amont).
          showToast('Crédits épuisés pour aujourd’hui.', 'info')
          router.push(ROUTES.OFFRE.INDEX)
        } else if (suggestions.length === 0) {
          // AUCUN produit ne qualifie (pas d'orange/rouge, pas de restriction, vert ≥ jaune)
          // → la routine est réellement propre.
          showToast('Rien à optimiser ✨ tes produits sont déjà propres.', 'success')
        } else if (resp.aiUnavailable) {
          // L'IA s'est abstenue (indispo ponctuelle) : rien n'a été conclu, ne
          // SURTOUT pas dire « aucune alternative » (ce serait faux).
          showToast('Analyse momentanément indisponible. Réessaie dans un instant.', 'info')
        } else {
          // L'IA a réellement évalué et rien n'était à la fois plus propre ET
          // compatible (souvent à cause des restrictions). Message honnête.
          showToast(
            'Aucune alternative plus propre trouvée pour l’instant (compte tenu de ton profil et de tes restrictions).',
            'info',
          )
        }
        return
      }

      const deckData: DeckSuggestion[] = withAlt.map((s) => {
        const alt = s.alternative!
        return {
          key: s.analysisId,
          productAnalysisId: s.analysisId,
          productTitle: s.productName,
          productScore: s.productScore,
          productImageUrl: s.productImageUrl,
          dangerLabel:
            s.dangerColor === 'rouge' ? 'À éviter' : s.dangerColor === 'orange' ? 'À surveiller' : null,
          dangerColor: s.dangerColor,
          alternative: {
            ean: alt.ean,
            brand: alt.brand,
            name: alt.name,
            imageUrl: alt.image_url,
            score: alt.score,
            scoreLabel: alt.score_label,
            scoreTone: alt.score_tone,
            countTotal: null,
            ingredientsText: alt.ingredients_text,
            countOrange: 0,
            countRouge: 0,
          },
          alternativeScore: alt.score,
          reason: s.reason,
        }
      })
      await seedKept(deckData)
      setDeck(deckData)
      setDeckOpen(true)
      if (anyLocked) showToast('Crédits épuisés pour certains produits. Reviens demain.', 'info')
    } catch {
      showToast('Suggestions indisponibles. Réessaie.', 'error')
    } finally {
      setDeckLoading(false)
    }
  }, [items, restrictions, deckLoading, qc, seedKept])

  const handleKeep = useCallback(
    async (s: DeckSuggestion) => {
      if (keptKeys.has(s.key) || keepingKey === s.key) return
      setKeepingKey(s.key)
      try {
        const ok = await keep(s.alternative)
        if (ok) setKeptKeys((prev) => new Set(prev).add(s.key))
        else showToast("Impossible d'ajouter. Réessaie.", 'error')
      } finally {
        setKeepingKey(null)
      }
    },
    [keep, keptKeys, keepingKey],
  )

  const handleOpenAlternative = useCallback(
    (s: DeckSuggestion) => {
      void launchAlternative(s.alternative)
    },
    [launchAlternative],
  )

  const handleCompare = useCallback(
    async (s: DeckSuggestion) => {
      const routineId = s.productAnalysisId
      if (!routineId) return
      setComparingKey(s.key)
      try {
        const altId = await ensureAnalysisId(s.alternative)
        if (!altId) {
          showToast('Comparaison impossible. Réessaie.', 'error')
          return
        }
        const already = await readAiCache(
          'compare-insights',
          compareInsightsKey(routineId, altId),
          TTL_COMPARE_INSIGHTS_MS,
        )
        if (!already) {
          const { data: credit } = await supabase.rpc(
            'cosme_check_consume_credit' as never,
            { p_feature: 'compare' } as never,
          )
          if ((credit as { ok?: boolean } | null)?.ok !== true) {
            showToast('Crédits épuisés pour aujourd’hui.', 'info')
            router.push(ROUTES.OFFRE.INDEX)
            return
          }
          void qc.invalidateQueries({ queryKey: ['credits'] })
        }
        router.push(`${ROUTES.COMPARE.INDEX}?ids=${routineId},${altId}` as never)
      } catch {
        showToast('Comparaison impossible. Réessaie.', 'error')
      } finally {
        setComparingKey(null)
      }
    },
    [ensureAnalysisId, qc],
  )

  const closeDeck = useCallback(() => setDeckOpen(false), [])

  return {
    deckOpen,
    deck,
    deckLoading,
    keepingKey,
    comparingKey,
    keptKeys,
    openSuggestions,
    handleKeep,
    handleCompare,
    handleOpenAlternative,
    closeDeck,
  }
}
