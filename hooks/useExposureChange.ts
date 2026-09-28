/**
 * useExposureChange : mémorise la note d'exposition de la routine (par
 * utilisateur, AsyncStorage) pour afficher son évolution après un ajout ou un
 * retrait de produit. Logique pure : lib/routine/exposureDelta.ts.
 */
import { useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

import {
  exposureChange,
  nextExposureHistory,
  type ExposureChange,
  type ExposureHistory,
} from '@/lib/routine/exposureDelta'

const KEY = (userId: string) => `cosmecheck:exposure_history:${userId}`
const EMPTY: ExposureHistory = { baseline: null, current: null }

export function useExposureChange(
  userId: string | null | undefined,
  score: number,
  count: number,
  sig: string,
  ready: boolean,
): ExposureChange {
  const [change, setChange] = useState<ExposureChange>({ kind: 'none' })

  useEffect(() => {
    if (!userId || !ready || count === 0) return
    let cancelled = false
    void (async () => {
      let prev = EMPTY
      try {
        const raw = await AsyncStorage.getItem(KEY(userId))
        if (raw) prev = JSON.parse(raw) as ExposureHistory
      } catch {
        prev = EMPTY
      }
      const next = nextExposureHistory(prev, { score, count, sig })
      if (!cancelled) setChange(exposureChange(next))
      try {
        await AsyncStorage.setItem(KEY(userId), JSON.stringify(next))
      } catch {
        // best-effort : sans stockage, pas de message d'évolution.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [userId, score, count, sig, ready])

  return change
}
