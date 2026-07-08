-- Infra notifications push distantes personnalisées. APPLIQUEE EN PROD le 7 juil 2026 via MCP (notifications_push_v1).
-- pg_net (cron -> Edge) + params notif admin-configurables + table push_tokens + RPC register.

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

ALTER TABLE cosme_check.app_config
  ADD COLUMN IF NOT EXISTS notif_reminders_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notif_bilan_weekday integer NOT NULL DEFAULT 7
    CONSTRAINT app_config_notif_weekday_chk CHECK (notif_bilan_weekday BETWEEN 1 AND 7),
  ADD COLUMN IF NOT EXISTS notif_bilan_hour integer NOT NULL DEFAULT 18
    CONSTRAINT app_config_notif_hour_chk CHECK (notif_bilan_hour BETWEEN 0 AND 23),
  ADD COLUMN IF NOT EXISTS notif_conflict_alerts boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.cosme_check_get_app_config()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO 'cosme_check','public' AS $fn$
  SELECT jsonb_build_object(
    'signups_open', c.signups_open,
    'flag_deep_search', c.flag_deep_search,
    'flag_suggestions', c.flag_suggestions,
    'flag_advisor', c.flag_advisor,
    'flag_public_share', c.flag_public_share,
    'flag_routine_reorganize', c.flag_routine_reorganize,
    'flag_conflicts', c.flag_conflicts,
    'flag_skin_score', c.flag_skin_score,
    'flag_weekly_picks', c.flag_weekly_picks,
    'notif_reminders_enabled', c.notif_reminders_enabled,
    'notif_bilan_weekday', c.notif_bilan_weekday,
    'notif_bilan_hour', c.notif_bilan_hour,
    'notif_conflict_alerts', c.notif_conflict_alerts,
    'maintenance_mode', c.maintenance_mode,
    'maintenance_message', c.maintenance_message
  ) FROM cosme_check.app_config c WHERE c.id = 1;
$fn$;

CREATE OR REPLACE FUNCTION public.cosme_check_admin_set_app_config(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'cosme_check','public' AS $fn$
BEGIN
  UPDATE cosme_check.app_config SET
    signup_default_tier = CASE WHEN p ? 'signup_default_tier' THEN p->>'signup_default_tier' ELSE signup_default_tier END,
    signups_open        = CASE WHEN p ? 'signups_open' THEN (p->>'signups_open')::boolean ELSE signups_open END,
    flag_deep_search    = CASE WHEN p ? 'flag_deep_search' THEN (p->>'flag_deep_search')::boolean ELSE flag_deep_search END,
    flag_suggestions    = CASE WHEN p ? 'flag_suggestions' THEN (p->>'flag_suggestions')::boolean ELSE flag_suggestions END,
    flag_advisor        = CASE WHEN p ? 'flag_advisor' THEN (p->>'flag_advisor')::boolean ELSE flag_advisor END,
    flag_public_share   = CASE WHEN p ? 'flag_public_share' THEN (p->>'flag_public_share')::boolean ELSE flag_public_share END,
    flag_routine_reorganize = CASE WHEN p ? 'flag_routine_reorganize' THEN (p->>'flag_routine_reorganize')::boolean ELSE flag_routine_reorganize END,
    flag_conflicts      = CASE WHEN p ? 'flag_conflicts' THEN (p->>'flag_conflicts')::boolean ELSE flag_conflicts END,
    flag_skin_score     = CASE WHEN p ? 'flag_skin_score' THEN (p->>'flag_skin_score')::boolean ELSE flag_skin_score END,
    flag_weekly_picks   = CASE WHEN p ? 'flag_weekly_picks' THEN (p->>'flag_weekly_picks')::boolean ELSE flag_weekly_picks END,
    notif_reminders_enabled = CASE WHEN p ? 'notif_reminders_enabled' THEN (p->>'notif_reminders_enabled')::boolean ELSE notif_reminders_enabled END,
    notif_bilan_weekday = CASE WHEN p ? 'notif_bilan_weekday' THEN (p->>'notif_bilan_weekday')::int ELSE notif_bilan_weekday END,
    notif_bilan_hour    = CASE WHEN p ? 'notif_bilan_hour' THEN (p->>'notif_bilan_hour')::int ELSE notif_bilan_hour END,
    notif_conflict_alerts = CASE WHEN p ? 'notif_conflict_alerts' THEN (p->>'notif_conflict_alerts')::boolean ELSE notif_conflict_alerts END,
    ai_cost_alert_daily_usd   = CASE WHEN p ? 'ai_cost_alert_daily_usd' THEN NULLIF(p->>'ai_cost_alert_daily_usd','')::numeric ELSE ai_cost_alert_daily_usd END,
    ai_cost_alert_monthly_usd = CASE WHEN p ? 'ai_cost_alert_monthly_usd' THEN NULLIF(p->>'ai_cost_alert_monthly_usd','')::numeric ELSE ai_cost_alert_monthly_usd END,
    maintenance_mode    = CASE WHEN p ? 'maintenance_mode' THEN (p->>'maintenance_mode')::boolean ELSE maintenance_mode END,
    maintenance_message = CASE WHEN p ? 'maintenance_message' THEN p->>'maintenance_message' ELSE maintenance_message END,
    updated_at = now(),
    updated_by = COALESCE(p->>'updated_by', updated_by)
  WHERE id = 1;
  RETURN public.cosme_check_admin_get_app_config();
END;
$fn$;

CREATE TABLE IF NOT EXISTS cosme_check.push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  platform text NOT NULL DEFAULT 'unknown',
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON cosme_check.push_tokens(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON cosme_check.push_tokens TO authenticated;
ALTER TABLE cosme_check.push_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY push_tokens_own ON cosme_check.push_tokens
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.cosme_check_register_push_token(p_token text, p_platform text DEFAULT 'unknown')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'cosme_check','public' AS $fn$
DECLARE v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated'); END IF;
  IF p_token IS NULL OR length(trim(p_token)) < 10 THEN RETURN jsonb_build_object('ok', false, 'error', 'invalid_token'); END IF;
  INSERT INTO cosme_check.push_tokens(user_id, token, platform, updated_at)
    VALUES (v_user, trim(p_token), COALESCE(p_platform,'unknown'), now())
  ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform, updated_at = now();
  RETURN jsonb_build_object('ok', true);
END;
$fn$;
REVOKE ALL ON FUNCTION public.cosme_check_register_push_token(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cosme_check_register_push_token(text, text) TO authenticated;
