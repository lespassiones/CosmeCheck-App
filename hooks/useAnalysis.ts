/**
 * useAnalysis — mutation react-query qui lance l'analyse INCI.
 *
 * - Cache l'INCI en attente (lib/storage/session) AVANT l'appel, pour pouvoir
 *   reprendre après un crash / passage en arrière-plan.
 * - Sur succès : cache le résultat localement, mémorise le dernier id, purge le
 *   pending, et invalide les caches react-query ['credits', userId] + ['dashboard'].
 * - Sur CreditExhaustedError : émet un événement global
 *   'cosmecheck:credits-exhausted' (DeviceEventEmitter) pour que WORKSTREAM 3
 *   ouvre la modale d'upsell, sans créer de dépendance dure à un store.
 *
 * Le runner (lib/analysis/analyser) gère l'appel Edge Function, le parsing,
 * et le post-traitement des restrictions.
 */

import { useCallback } from 'react'
import { DeviceEventEmitter } from 'react-native'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import {
  runAnalysis,
  CreditExhaustedError,
  NetworkError,
  ApiError,
  type RunAnalysisParams,
  type RunAnalysisResult,
} from '@/lib/analysis/analyser'
import {
  setPendingInci,
  clearPendingInci,
  cacheAnalysis,
  setLastAnalysisId,
} from '@/lib/storage/session'
import { useAuth } from '@/hooks/useAuth'

/** Nom de l'événement global écouté par WORKSTREAM 3 (modale crédits). */
export const CREDITS_EXHAUSTED_EVENT = 'cosmecheck:credits-exhausted'

interface UseAnalysisReturn {
  isAnalyzing: boolean
  error: string | null
  lastAnalysisId: string | null
  runAnalysis: (params: RunAnalysisParams) => Promise<RunAnalysisResult | null>
  reset: () => void
}

/** Traduit une erreur runner en message utilisateur (FR). */
function toErrorMessage(err: unknown): string {
  if (err instanceof CreditExhaustedError) return err.message || 'Crédits épuisés'
  if (err instanceof NetworkError) return err.message || 'Connexion impossible'
  if (err instanceof ApiError) return err.message || 'Erreur du serveur'
  if (err instanceof Error) return err.message
  return 'Une erreur est survenue'
}

export function useAnalysis(): UseAnalysisReturn {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const queryClient = useQueryClient()

  const mutation = useMutation<RunAnalysisResult, Error, RunAnalysisParams>({
    mutationFn: async (params) => {
      // Persiste l'INCI en attente avant l'appel (reprise post-crash).
      await setPendingInci(params.inciInput, params.source, params.productName)
      return runAnalysis(params)
    },
    onSuccess: async (result) => {
      // Cache local + dernier id, puis purge le pending.
      await Promise.all([
        cacheAnalysis(result.analysisId, result.response),
        setLastAnalysisId(result.analysisId),
      ])
      await clearPendingInci()

      // Rafraîchit crédits + dashboard.
      void queryClient.invalidateQueries({ queryKey: ['credits', userId] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: (err) => {
      if (err instanceof CreditExhaustedError) {
        // Signal global → WORKSTREAM 3 ouvre la modale d'upsell.
        DeviceEventEmitter.emit(CREDITS_EXHAUSTED_EVENT, err.credits ?? null)
        // Les crédits ont changé côté serveur : on rafraîchit le solde.
        void queryClient.invalidateQueries({ queryKey: ['credits', userId] })
      }
    },
  })

  const run = useCallback(
    async (params: RunAnalysisParams): Promise<RunAnalysisResult | null> => {
      try {
        return await mutation.mutateAsync(params)
      } catch {
        // L'erreur est exposée via mutation.error / le champ `error` ci-dessous.
        return null
      }
    },
    [mutation],
  )

  return {
    isAnalyzing: mutation.isPending,
    error: mutation.error ? toErrorMessage(mutation.error) : null,
    lastAnalysisId: mutation.data?.analysisId ?? null,
    runAnalysis: run,
    reset: mutation.reset,
  }
}
