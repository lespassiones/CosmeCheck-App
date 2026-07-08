/**
 * useSkinScore — état agrégé du score de peau (check-ins hebdo + scans visage).
 *
 * Compose deux queries react-query (`skinCheckins`, `faceScans`) avec les
 * fonctions PURES de `lib/skin/score.ts` : headline (blend 0.6/0.4 documenté),
 * delta hebdo, timeline fusionnée. Aucune logique de score dupliquée ici.
 *
 * Les URLs signées des photos ne sont PAS gérées ici (query `skinPhotoUrl`
 * portée par PhotoJournalStrip, blacklistée de la persistance).
 */

import { useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import {
  buildTimeline,
  headlineScore,
  weeklyDelta,
  type SkinPoint,
} from '@/lib/skin/score'
import { isoWeekKey } from '@/lib/skin/week'
import {
  fetchCheckins,
  fetchFaceScans,
  type CheckinRow,
  type FaceScanRow,
} from '@/lib/skin/api'
import { useAuth } from '@/hooks/useAuth'

export interface UseSkinScoreReturn {
  headline: number | null
  blended: boolean
  delta: number | null
  lastCheckinAt: string | null
  /** true si un bilan a déjà été fait pour la semaine ISO courante. */
  lastCheckinWeekDone: boolean
  timeline: SkinPoint[]
  scans: FaceScanRow[]
  hasData: boolean
  isLoading: boolean
  refresh: () => void
}

const STALE = 60 * 1000

function checkinToPoint(row: CheckinRow): SkinPoint {
  return { date: row.created_at, source: 'checkin', dims: row.scores, global: row.score }
}

function scanToPoint(row: FaceScanRow): SkinPoint {
  return { date: row.created_at, source: 'scan', dims: row.metrics, global: row.score }
}

export function useSkinScore(): UseSkinScoreReturn {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const queryClient = useQueryClient()

  const checkinsQuery = useQuery<CheckinRow[]>({
    queryKey: ['skinCheckins', userId],
    enabled: Boolean(userId),
    staleTime: STALE,
    queryFn: fetchCheckins,
  })

  const scansQuery = useQuery<FaceScanRow[]>({
    queryKey: ['faceScans', userId],
    enabled: Boolean(userId),
    staleTime: STALE,
    queryFn: fetchFaceScans,
  })

  const checkins = useMemo(() => checkinsQuery.data ?? [], [checkinsQuery.data])
  const scans = useMemo(() => scansQuery.data ?? [], [scansQuery.data])

  const timeline = useMemo(
    () => buildTimeline(checkins.map(checkinToPoint), scans.map(scanToPoint)),
    [checkins, scans],
  )

  const { score: headline, blended } = useMemo(() => headlineScore(timeline), [timeline])
  const delta = useMemo(() => weeklyDelta(timeline), [timeline])

  // Les check-ins sont triés croissants → le dernier est en fin de liste.
  const lastCheckin = checkins.length > 0 ? checkins[checkins.length - 1] : null
  const lastCheckinAt = lastCheckin?.created_at ?? null
  const lastCheckinWeekDone = lastCheckin
    ? lastCheckin.week_key === isoWeekKey(new Date())
    : false

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['skinCheckins', userId] })
    void queryClient.invalidateQueries({ queryKey: ['faceScans', userId] })
  }, [queryClient, userId])

  return {
    headline,
    blended,
    delta,
    lastCheckinAt,
    lastCheckinWeekDone,
    timeline,
    scans,
    hasData: timeline.length > 0,
    isLoading: checkinsQuery.isLoading || scansQuery.isLoading,
    refresh,
  }
}
