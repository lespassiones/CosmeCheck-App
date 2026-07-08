-- Flags du chantier retention (routine reorganisee, conflits, score de peau, pepites hebdo).
-- Tous par defaut FALSE jusqu'au lancement (activation via l'admin).
-- APPLIQUEE EN PROD le 7 juillet 2026 via MCP (migration app_config_flags_retention_v1).

ALTER TABLE cosme_check.app_config
  ADD COLUMN IF NOT EXISTS flag_routine_reorganize boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS flag_conflicts boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS flag_skin_score boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS flag_weekly_picks boolean NOT NULL DEFAULT false;

-- RPC publique lue par le client : exposer les 4 nouveaux flags.
CREATE OR REPLACE FUNCTION public.cosme_check_get_app_config()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'cosme_check', 'public'
AS $function$
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
    'maintenance_mode', c.maintenance_mode,
    'maintenance_message', c.maintenance_message
  ) FROM cosme_check.app_config c WHERE c.id = 1;
$function$;

-- Setter admin : brancher les 4 nouveaux flags (le getter admin to_jsonb() les expose deja).
CREATE OR REPLACE FUNCTION public.cosme_check_admin_set_app_config(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'cosme_check', 'public'
AS $function$
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
    ai_cost_alert_daily_usd   = CASE WHEN p ? 'ai_cost_alert_daily_usd' THEN NULLIF(p->>'ai_cost_alert_daily_usd','')::numeric ELSE ai_cost_alert_daily_usd END,
    ai_cost_alert_monthly_usd = CASE WHEN p ? 'ai_cost_alert_monthly_usd' THEN NULLIF(p->>'ai_cost_alert_monthly_usd','')::numeric ELSE ai_cost_alert_monthly_usd END,
    maintenance_mode    = CASE WHEN p ? 'maintenance_mode' THEN (p->>'maintenance_mode')::boolean ELSE maintenance_mode END,
    maintenance_message = CASE WHEN p ? 'maintenance_message' THEN p->>'maintenance_message' ELSE maintenance_message END,
    updated_at = now(),
    updated_by = COALESCE(p->>'updated_by', updated_by)
  WHERE id = 1;
  RETURN public.cosme_check_admin_get_app_config();
END;
$function$;
