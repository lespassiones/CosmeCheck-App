-- Global app configuration (single row) for the admin "Paramètres" page:
-- default signup tier, signups open/closed, feature flags, AI cost alert
-- thresholds, maintenance mode. Apps read the PUBLIC subset at runtime via
-- public.cosme_check_get_app_config(). Applied to prod via MCP.
CREATE TABLE IF NOT EXISTS cosme_check.app_config (
  id                       INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  signup_default_tier      TEXT    NOT NULL DEFAULT 'free',
  signups_open             BOOLEAN NOT NULL DEFAULT true,
  flag_deep_search         BOOLEAN NOT NULL DEFAULT true,
  flag_suggestions         BOOLEAN NOT NULL DEFAULT true,
  flag_advisor             BOOLEAN NOT NULL DEFAULT true,
  flag_public_share        BOOLEAN NOT NULL DEFAULT true,
  ai_cost_alert_daily_usd  NUMERIC,
  ai_cost_alert_monthly_usd NUMERIC,
  maintenance_mode         BOOLEAN NOT NULL DEFAULT false,
  maintenance_message      TEXT,
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by               TEXT
);
INSERT INTO cosme_check.app_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE cosme_check.app_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS app_config_read ON cosme_check.app_config;
CREATE POLICY app_config_read ON cosme_check.app_config FOR SELECT TO authenticated, anon USING (true);
GRANT SELECT ON cosme_check.app_config TO authenticated, anon;

CREATE OR REPLACE FUNCTION cosme_check.cosme_check_admin_get_app_config()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = cosme_check, public AS $fn$
  SELECT to_jsonb(c) FROM cosme_check.app_config c WHERE c.id = 1;
$fn$;
GRANT EXECUTE ON FUNCTION cosme_check.cosme_check_admin_get_app_config() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION cosme_check.cosme_check_admin_set_app_config(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = cosme_check, public AS $fn$
BEGIN
  UPDATE cosme_check.app_config SET
    signup_default_tier = CASE WHEN p ? 'signup_default_tier' THEN p->>'signup_default_tier' ELSE signup_default_tier END,
    signups_open        = CASE WHEN p ? 'signups_open' THEN (p->>'signups_open')::boolean ELSE signups_open END,
    flag_deep_search    = CASE WHEN p ? 'flag_deep_search' THEN (p->>'flag_deep_search')::boolean ELSE flag_deep_search END,
    flag_suggestions    = CASE WHEN p ? 'flag_suggestions' THEN (p->>'flag_suggestions')::boolean ELSE flag_suggestions END,
    flag_advisor        = CASE WHEN p ? 'flag_advisor' THEN (p->>'flag_advisor')::boolean ELSE flag_advisor END,
    flag_public_share   = CASE WHEN p ? 'flag_public_share' THEN (p->>'flag_public_share')::boolean ELSE flag_public_share END,
    ai_cost_alert_daily_usd   = CASE WHEN p ? 'ai_cost_alert_daily_usd' THEN NULLIF(p->>'ai_cost_alert_daily_usd','')::numeric ELSE ai_cost_alert_daily_usd END,
    ai_cost_alert_monthly_usd = CASE WHEN p ? 'ai_cost_alert_monthly_usd' THEN NULLIF(p->>'ai_cost_alert_monthly_usd','')::numeric ELSE ai_cost_alert_monthly_usd END,
    maintenance_mode    = CASE WHEN p ? 'maintenance_mode' THEN (p->>'maintenance_mode')::boolean ELSE maintenance_mode END,
    maintenance_message = CASE WHEN p ? 'maintenance_message' THEN p->>'maintenance_message' ELSE maintenance_message END,
    updated_at = now(),
    updated_by = COALESCE(p->>'updated_by', updated_by)
  WHERE id = 1;
  RETURN cosme_check.cosme_check_admin_get_app_config();
END;
$fn$;
GRANT EXECUTE ON FUNCTION cosme_check.cosme_check_admin_set_app_config(jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cosme_check_get_app_config()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = cosme_check, public AS $fn$
  SELECT jsonb_build_object(
    'signups_open', c.signups_open,
    'flag_deep_search', c.flag_deep_search,
    'flag_suggestions', c.flag_suggestions,
    'flag_advisor', c.flag_advisor,
    'flag_public_share', c.flag_public_share,
    'maintenance_mode', c.maintenance_mode,
    'maintenance_message', c.maintenance_message
  ) FROM cosme_check.app_config c WHERE c.id = 1;
$fn$;
GRANT EXECUTE ON FUNCTION public.cosme_check_get_app_config() TO authenticated, anon;

-- Configurable default signup tier (+ optional signups freeze) in the new-user trigger.
CREATE OR REPLACE FUNCTION cosme_check.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = cosme_check, public AS $fn$
DECLARE v_open BOOLEAN; v_tier TEXT;
BEGIN
  SELECT signups_open, signup_default_tier INTO v_open, v_tier FROM cosme_check.app_config WHERE id = 1;
  IF v_open IS FALSE THEN
    RAISE EXCEPTION 'signups_closed' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO cosme_check.user_profiles (id, first_name, tier)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', ''), COALESCE(v_tier, 'free'))
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO cosme_check.user_credits (user_id, day, used, daily_limit)
  VALUES (NEW.id, CURRENT_DATE, 0, 5)
  ON CONFLICT (user_id, day) DO NOTHING;
  RETURN NEW;
END;
$fn$;
