/**
 * Types Supabase — alignés sur le schéma RÉEL `cosme_check` (vérifié sur la
 * base live). NE PAS se fier aux suppositions : ce sont les colonnes réelles.
 *
 * Rappels schéma importants :
 * - `user_profiles` : pas de colonne email/avatar/credits. Le profil beauté
 *   et le flag onboarding vivent DANS `preferences` (jsonb) — voir
 *   `lib/skin/profile.ts` (clé `skin`, et `onboardingShown` à la racine).
 *   Les restrictions vivent aussi dans `preferences.restrictions`.
 * - `routine_items` : juste (id, user_id, analysis_id, frequency, added_at).
 *   Le nom/score/couleur viennent de l'analyse jointe (`analyses`).
 * - `analyses.result_json` : l'AnalyseResponse complet (jsonb).
 * - Les crédits sont par (user_id, day) dans `user_credits`, lus via la RPC
 *   `cosme_check_get_credits`.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Tier = 'free' | 'premium'
export type RoutineFrequency = 'daily' | 'weekly' | 'monthly'
export type FeedbackKind = 'feedback' | 'contact'
export type RenewalPeriod = 'one_time' | 'daily' | 'weekly' | 'monthly' | 'yearly'

// ─── Database (générique supabase-js) ──────────────────────────────────────
// Les RPC `cosme_check_*` sont définies dans le schéma `public` (appel via
// supabase.rpc(...)). Les tables métier sont dans le schéma `cosme_check`
// (appel via supabase.schema('cosme_check').from(...) → helper `db()`).

export interface Database {
  public: {
    Tables: { [_ in never]: never }
    Views: { [_ in never]: never }
    Functions: {
      cosme_check_get_credits: {
        Args: Record<string, never>
        Returns: Json
      }
      cosme_check_get_app_config: {
        Args: Record<string, never>
        Returns: Json
      }
      cosme_check_consume_credit: {
        Args: { p_feature: string }
        Returns: Json
      }
      cosme_check_get_feedback_status: {
        Args: Record<string, never>
        Returns: Json
      }
      cosme_check_submit_feedback: {
        Args: { p_rating: number; p_message: string; p_trigger_source: string }
        Returns: Json
      }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
  cosme_check: {
    Tables: {
      user_profiles: {
        Row: {
          id: string
          first_name: string | null
          tier: Tier
          preferences: Json
          created_at: string
          updated_at: string
          suspended_at: string | null
        }
        Insert: {
          id: string
          first_name?: string | null
          tier?: Tier
          preferences?: Json
        }
        Update: {
          first_name?: string | null
          tier?: Tier
          preferences?: Json
        }
      }
      analyses: {
        Row: {
          id: string
          user_id: string
          name: string | null
          product_label: string | null
          category: string | null
          input_text: string
          result_json: Json | null
          score: number | null
          created_at: string
          brand: string | null
          product_type: string | null
          product_description: string | null
          promise_source_url: string | null
        }
        Insert: {
          id?: string
          user_id: string
          name?: string | null
          product_label?: string | null
          category?: string | null
          input_text: string
          result_json?: Json | null
          score?: number | null
          brand?: string | null
          product_type?: string | null
          product_description?: string | null
          promise_source_url?: string | null
        }
        Update: {
          name?: string | null
          product_label?: string | null
          category?: string | null
          result_json?: Json | null
          score?: number | null
          brand?: string | null
        }
      }
      routine_items: {
        Row: {
          id: string
          user_id: string
          analysis_id: string
          frequency: RoutineFrequency
          added_at: string
        }
        Insert: {
          id?: string
          user_id: string
          analysis_id: string
          frequency?: RoutineFrequency
        }
        Update: {
          frequency?: RoutineFrequency
        }
      }
      coherence_analyses: {
        Row: {
          id: string
          user_id: string
          analysis_id: string
          description: string
          result_json: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          analysis_id: string
          description: string
          result_json?: Json | null
        }
        Update: {
          description?: string
          result_json?: Json | null
        }
      }
      user_credits: {
        Row: {
          user_id: string
          day: string
          used: number
          daily_limit: number
          renewal_period?: string
          renewal_interval_days?: number
          last_renewal_at?: string
        }
        Insert: {
          user_id: string
          day?: string
          used?: number
          daily_limit?: number
          renewal_period?: string
          renewal_interval_days?: number
          last_renewal_at?: string
        }
        Update: {
          used?: number
          daily_limit?: number
          renewal_period?: string
          renewal_interval_days?: number
          last_renewal_at?: string
        }
      }
      credit_tiers: {
        Row: {
          tier: string
          credit_amount: number
          renewal_period: RenewalPeriod
          renewal_interval_days?: number
          updated_at: string
        }
        Insert: {
          tier: string
          credit_amount: number
          renewal_period: RenewalPeriod
          renewal_interval_days?: number
        }
        Update: {
          credit_amount?: number
          renewal_period?: RenewalPeriod
          renewal_interval_days?: number
        }
      }
      user_credits_override: {
        Row: {
          id: number
          user_id: string
          credit_amount: number
          renewal_period: RenewalPeriod
          renewal_interval_days?: number
          active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          user_id: string
          credit_amount: number
          renewal_period: RenewalPeriod
          renewal_interval_days?: number
          active?: boolean
        }
        Update: {
          credit_amount?: number
          renewal_period?: RenewalPeriod
          renewal_interval_days?: number
          active?: boolean
        }
      }
      user_feedback: {
        Row: {
          id: string
          user_id: string | null
          kind: FeedbackKind
          rating: number | null
          trigger_source: string | null
          contact_first_name: string | null
          contact_email: string | null
          contact_subject: string | null
          message: string | null
          created_at: string
        }
        Insert: {
          user_id?: string | null
          kind: FeedbackKind
          rating?: number | null
          trigger_source?: string | null
          message?: string | null
        }
        Update: never
      }
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}

// ─── Alias pratiques (Row types) ───────────────────────────────────────────

export type UserProfileRow = Database['cosme_check']['Tables']['user_profiles']['Row']
export type AnalysisRow = Database['cosme_check']['Tables']['analyses']['Row']
export type RoutineItemRow = Database['cosme_check']['Tables']['routine_items']['Row']
export type CoherenceAnalysisRow =
  Database['cosme_check']['Tables']['coherence_analyses']['Row']
export type UserCreditsRow = Database['cosme_check']['Tables']['user_credits']['Row']

// ─── Types métier dérivés ───────────────────────────────────────────────────

/** Résultat de la RPC `cosme_check_get_credits`. */
export interface Credits {
  ok: boolean
  used?: number
  limit?: number
  remaining?: number
  renewal_period?: RenewalPeriod
  renewal_interval_days?: number
  error?: string
}

/** Restrictions utilisateur (stockées dans preferences.restrictions). */
export interface UserRestrictions {
  families: string[]
  ingredients: { slug: string; name: string }[]
}

export function readRestrictions(
  prefs: Record<string, unknown> | null | undefined,
): UserRestrictions {
  const empty: UserRestrictions = { families: [], ingredients: [] }
  if (!prefs || typeof prefs !== 'object') return empty
  const raw = (prefs as { restrictions?: unknown }).restrictions
  if (!raw || typeof raw !== 'object') return empty
  const r = raw as Record<string, unknown>
  return {
    families: Array.isArray(r.families)
      ? (r.families as unknown[]).filter((f): f is string => typeof f === 'string')
      : [],
    ingredients: Array.isArray(r.ingredients)
      ? (r.ingredients as { slug: string; name: string }[]).filter(
          (i) => i && typeof i === 'object' && 'slug' in i,
        )
      : [],
  }
}

// ─── Compat (verticals à venir : analyse / routine / promesses / advisor) ────
// Ces alias gardent les stubs PAS ENCORE implémentés compilables. Le CORE
// (auth / onboarding / dashboard / profil) DOIT utiliser les types canoniques
// ci-dessus : `UserProfileRow`, `SkinProfile` (lib/skin/profile), `Credits`,
// `RoutineItemRow`, et `ColorRating` (lib/analysis/types).
export type { ColorRating } from '@/lib/analysis/types'
export type Analysis = AnalysisRow
export type RoutineItem = RoutineItemRow
export type UserProfile = UserProfileRow
export type UserPreferences = Record<string, unknown>
export type SkinConcern = string
export type HairConcern = string
export type BeautyGoal = string

export interface FamilyExposure {
  family: string
  exposure_level: number
  color_rating: import('@/lib/analysis/types').ColorRating
  ingredients: string[]
}
export interface RoutineExposureMetrics {
  cumulative_score: number
  products_count: number
  family_exposure: FamilyExposure[]
  worst_product: RoutineItemRow | null
  simulated_score_without_worst: number | null
}
export interface PromiseVerdict {
  claim: string
  verdict: import('@/lib/analysis/types').ColorRating
  explanation: string
  supporting_ingredients: string[]
}
export interface CoherenceResult {
  overall_verdict: import('@/lib/analysis/types').ColorRating
  promises: PromiseVerdict[]
  ai_summary: string
}
