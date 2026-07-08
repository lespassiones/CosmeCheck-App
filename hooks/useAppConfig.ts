/**
 * useAppConfig — configuration applicative globale (feature flags + maintenance)
 * pilotée depuis l'admin (page « Paramètres »), lue au runtime via la RPC
 * publique `public.cosme_check_get_app_config()`.
 *
 * Le résultat jsonb expose :
 *   { signups_open, flag_deep_search, flag_suggestions, flag_advisor,
 *     flag_public_share, maintenance_mode, maintenance_message }
 *
 * FAIL-OPEN : si la RPC échoue (réseau, DB), on renvoie les valeurs par défaut
 * (tout activé, maintenance OFF) → un incident transitoire ne doit jamais
 * couper une feature ni afficher un faux écran de maintenance.
 *
 * Polling 30 s (comme useCredits) pour propager rapidement un changement admin
 * sans rebuild ni redéploiement.
 */

import { useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase/client'

export interface AppConfig {
  signups_open: boolean
  flag_deep_search: boolean
  flag_suggestions: boolean
  flag_advisor: boolean
  flag_public_share: boolean
  /**
   * Flags du chantier rétention (juillet 2026). DÉROGATION VOLONTAIRE au
   * fail-open : défaut FALSE côté client ET côté DB tant que les features ne
   * sont pas lancées, pour qu'un échec RPC ne fasse jamais apparaître une
   * feature encore en rodage. Passer le défaut client à true au lancement si
   * on veut retrouver le comportement fail-open des autres flags.
   */
  flag_routine_reorganize: boolean
  flag_conflicts: boolean
  flag_skin_score: boolean
  flag_weekly_picks: boolean
  /** Notifications (pilotables depuis l'admin). */
  notif_reminders_enabled: boolean
  notif_bilan_weekday: number // ISO 1 (lundi) .. 7 (dimanche)
  notif_bilan_hour: number // 0..23
  notif_conflict_alerts: boolean
  maintenance_mode: boolean
  maintenance_message: string | null
}

export const DEFAULT_APP_CONFIG: AppConfig = {
  signups_open: true,
  flag_deep_search: true,
  flag_suggestions: true,
  flag_advisor: true,
  flag_public_share: true,
  flag_routine_reorganize: false,
  flag_conflicts: false,
  flag_skin_score: false,
  flag_weekly_picks: false,
  notif_reminders_enabled: true,
  notif_bilan_weekday: 7,
  notif_bilan_hour: 18,
  notif_conflict_alerts: true,
  maintenance_mode: false,
  maintenance_message: null,
}

function coerce(raw: unknown): AppConfig {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const bool = (k: keyof AppConfig): boolean =>
    typeof o[k] === 'boolean' ? (o[k] as boolean) : (DEFAULT_APP_CONFIG[k] as boolean)
  const int = (k: keyof AppConfig, min: number, max: number): number => {
    const v = o[k]
    if (typeof v === 'number' && Number.isFinite(v)) return Math.min(max, Math.max(min, Math.round(v)))
    return DEFAULT_APP_CONFIG[k] as number
  }
  return {
    signups_open: bool('signups_open'),
    flag_deep_search: bool('flag_deep_search'),
    flag_suggestions: bool('flag_suggestions'),
    flag_advisor: bool('flag_advisor'),
    flag_public_share: bool('flag_public_share'),
    flag_routine_reorganize: bool('flag_routine_reorganize'),
    flag_conflicts: bool('flag_conflicts'),
    flag_skin_score: bool('flag_skin_score'),
    flag_weekly_picks: bool('flag_weekly_picks'),
    notif_reminders_enabled: bool('notif_reminders_enabled'),
    notif_bilan_weekday: int('notif_bilan_weekday', 1, 7),
    notif_bilan_hour: int('notif_bilan_hour', 0, 23),
    notif_conflict_alerts: bool('notif_conflict_alerts'),
    maintenance_mode: bool('maintenance_mode'),
    maintenance_message:
      typeof o.maintenance_message === 'string' ? o.maintenance_message : null,
  }
}

interface UseAppConfigReturn {
  config: AppConfig
  isLoading: boolean
  refresh: () => void
}

export function useAppConfig(): UseAppConfigReturn {
  const {
    data,
    isLoading,
    refetch,
  } = useQuery<AppConfig>({
    // Clé globale (pas par-user) : la config est la même pour tout le monde.
    queryKey: ['appConfig'],
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data: row, error } = await supabase.rpc('cosme_check_get_app_config')
      if (error) throw error
      return coerce(row)
    },
  })

  // Polling 30 s pour capter les changements admin (maintenance, flags) sans
  // que l'utilisateur ait à relancer l'app.
  useEffect(() => {
    const interval = setInterval(() => {
      void refetch()
    }, 30000)
    return () => clearInterval(interval)
  }, [refetch])

  const config = useMemo(() => data ?? DEFAULT_APP_CONFIG, [data])

  return { config, isLoading, refresh: () => void refetch() }
}
