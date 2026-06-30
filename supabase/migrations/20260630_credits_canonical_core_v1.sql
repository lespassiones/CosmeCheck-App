-- ============================================================================
-- Canonical credit core (v1) — single source of truth.
-- Replaces the tangled duplicate RPCs with ONE coherent chain:
--   credit_interval_days / credit_period_start / credit_config_for / credit_state
--   public.cosme_check_get_credits      (drop-in replace; same fields + bonus/period_start)
--   public.cosme_check_consume_credit   (drop-in replace; REAL period window + bonus drawdown)
-- + credit_grants ledger (additive, non-renewable bonus credits)
--
-- Model:
--   - Effective config = active per-user override, else tier config, else free/5/daily.
--   - "used this period" = SUM(user_credits.used) over the calendar-aligned window
--     (daily=today, weekly=ISO week, monthly=month, yearly=year, one_time=all-time).
--     Keeps per-day rows intact (admin charts/history) while making weekly/monthly real.
--   - remaining = max(0, limit - used_period) + sum(active bonus grants).
--   - consume: draws from the period allocation first, then from bonus grants (FIFO).
-- Old duplicate RPCs left in place; dropped in a later cleanup migration.
-- ============================================================================

CREATE TABLE IF NOT EXISTS cosme_check.credit_grants (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount      INT  NOT NULL CHECK (amount > 0),
  remaining   INT  NOT NULL CHECK (remaining >= 0),
  note        TEXT,
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE cosme_check.credit_grants IS 'Credits bonus ponctuels (additifs, non renouvelables).';
CREATE INDEX IF NOT EXISTS idx_credit_grants_user_remaining
  ON cosme_check.credit_grants(user_id, created_at) WHERE remaining > 0;
ALTER TABLE cosme_check.credit_grants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS credit_grants_select_own ON cosme_check.credit_grants;
CREATE POLICY credit_grants_select_own ON cosme_check.credit_grants
  FOR SELECT TO authenticated USING (user_id = auth.uid());
GRANT SELECT ON cosme_check.credit_grants TO authenticated, anon;

CREATE OR REPLACE FUNCTION cosme_check.credit_interval_days(p_period TEXT)
RETURNS INT LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE p_period
    WHEN 'daily' THEN 1 WHEN 'weekly' THEN 7 WHEN 'monthly' THEN 30
    WHEN 'yearly' THEN 365 ELSE NULL END;
$fn$;

CREATE OR REPLACE FUNCTION cosme_check.credit_period_start(p_period TEXT, p_today DATE)
RETURNS DATE LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE p_period
    WHEN 'daily'   THEN p_today
    WHEN 'weekly'  THEN date_trunc('week',  p_today)::date
    WHEN 'monthly' THEN date_trunc('month', p_today)::date
    WHEN 'yearly'  THEN date_trunc('year',  p_today)::date
    WHEN 'one_time' THEN DATE '0001-01-01'
    ELSE p_today END;
$fn$;

CREATE OR REPLACE FUNCTION cosme_check.credit_config_for(p_user_id UUID)
RETURNS TABLE(credit_amount INT, renewal_period TEXT, renewal_interval_days INT, source TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = cosme_check, public AS $fn$
DECLARE v_active BOOLEAN;
BEGIN
  SELECT o.active INTO v_active FROM cosme_check.user_credits_override o WHERE o.user_id = p_user_id;
  IF v_active IS TRUE THEN
    RETURN QUERY SELECT o.credit_amount, o.renewal_period::text, o.renewal_interval_days, 'override'::text
      FROM cosme_check.user_credits_override o WHERE o.user_id = p_user_id AND o.active = true;
    RETURN;
  END IF;
  RETURN QUERY SELECT ct.credit_amount, ct.renewal_period::text, ct.renewal_interval_days, 'tier'::text
    FROM cosme_check.credit_tiers ct
    JOIN cosme_check.user_profiles up ON up.tier = ct.tier
    WHERE up.id = p_user_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 5, 'daily'::text, 1, 'fallback'::text;
  END IF;
END;
$fn$;

CREATE OR REPLACE FUNCTION cosme_check.credit_state(p_user_id UUID)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = cosme_check, public AS $fn$
DECLARE v_limit INT; v_period TEXT; v_interval INT; v_src TEXT; v_pstart DATE; v_used INT; v_bonus INT;
BEGIN
  SELECT credit_amount, renewal_period, renewal_interval_days, source
    INTO v_limit, v_period, v_interval, v_src FROM cosme_check.credit_config_for(p_user_id);
  IF v_limit IS NULL THEN v_limit := 5; v_period := 'daily'; v_interval := 1; v_src := 'fallback'; END IF;
  v_pstart := cosme_check.credit_period_start(v_period, CURRENT_DATE);
  SELECT COALESCE(SUM(uc.used), 0) INTO v_used FROM cosme_check.user_credits uc
    WHERE uc.user_id = p_user_id AND uc.day >= v_pstart;
  SELECT COALESCE(SUM(g.remaining), 0) INTO v_bonus FROM cosme_check.credit_grants g
    WHERE g.user_id = p_user_id AND g.remaining > 0;
  RETURN jsonb_build_object('ok', true, 'used', v_used, 'limit', v_limit,
    'remaining', GREATEST(0, v_limit - v_used) + v_bonus, 'bonus', v_bonus,
    'renewal_period', v_period, 'renewal_interval_days', v_interval,
    'period_start', v_pstart, 'config_source', v_src);
END;
$fn$;

DROP FUNCTION IF EXISTS public.cosme_check_get_credits();
CREATE FUNCTION public.cosme_check_get_credits()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = cosme_check, public AS $fn$
DECLARE v_user UUID := auth.uid();
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated'); END IF;
  RETURN cosme_check.credit_state(v_user);
END;
$fn$;
GRANT EXECUTE ON FUNCTION public.cosme_check_get_credits() TO authenticated, anon;

DROP FUNCTION IF EXISTS public.cosme_check_consume_credit(TEXT);
CREATE FUNCTION public.cosme_check_consume_credit(p_feature TEXT DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = cosme_check, public AS $fn$
DECLARE v_user UUID := auth.uid(); v_limit INT; v_period TEXT; v_interval INT; v_src TEXT;
  v_pstart DATE; v_used INT; v_bonus INT; v_rows INT; v_grant_id BIGINT;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated'); END IF;
  SELECT credit_amount, renewal_period, renewal_interval_days, source
    INTO v_limit, v_period, v_interval, v_src FROM cosme_check.credit_config_for(v_user);
  IF v_limit IS NULL THEN v_limit := 5; v_period := 'daily'; v_interval := 1; END IF;
  v_pstart := cosme_check.credit_period_start(v_period, CURRENT_DATE);
  INSERT INTO cosme_check.user_credits(user_id, day) VALUES (v_user, CURRENT_DATE)
    ON CONFLICT (user_id, day) DO NOTHING;
  UPDATE cosme_check.user_credits uc SET used = uc.used + 1
   WHERE uc.user_id = v_user AND uc.day = CURRENT_DATE
     AND (SELECT COALESCE(SUM(x.used), 0) FROM cosme_check.user_credits x
          WHERE x.user_id = v_user AND x.day >= v_pstart) < v_limit;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN
    SELECT COALESCE(SUM(uc.used), 0) INTO v_used FROM cosme_check.user_credits uc
      WHERE uc.user_id = v_user AND uc.day >= v_pstart;
    SELECT COALESCE(SUM(g.remaining), 0) INTO v_bonus FROM cosme_check.credit_grants g
      WHERE g.user_id = v_user AND g.remaining > 0;
    RETURN jsonb_build_object('ok', true, 'used', v_used, 'limit', v_limit,
      'remaining', GREATEST(0, v_limit - v_used) + v_bonus, 'bonus', v_bonus,
      'renewal_period', v_period, 'from_bonus', false);
  END IF;
  SELECT g.id INTO v_grant_id FROM cosme_check.credit_grants g
    WHERE g.user_id = v_user AND g.remaining > 0 ORDER BY g.created_at ASC LIMIT 1 FOR UPDATE;
  IF v_grant_id IS NOT NULL THEN
    UPDATE cosme_check.credit_grants SET remaining = remaining - 1 WHERE id = v_grant_id;
    SELECT COALESCE(SUM(uc.used), 0) INTO v_used FROM cosme_check.user_credits uc
      WHERE uc.user_id = v_user AND uc.day >= v_pstart;
    SELECT COALESCE(SUM(g.remaining), 0) INTO v_bonus FROM cosme_check.credit_grants g
      WHERE g.user_id = v_user AND g.remaining > 0;
    RETURN jsonb_build_object('ok', true, 'used', v_used, 'limit', v_limit,
      'remaining', v_bonus, 'bonus', v_bonus, 'renewal_period', v_period, 'from_bonus', true);
  END IF;
  SELECT COALESCE(SUM(uc.used), 0) INTO v_used FROM cosme_check.user_credits uc
    WHERE uc.user_id = v_user AND uc.day >= v_pstart;
  RETURN jsonb_build_object('ok', false, 'used', v_used, 'limit', v_limit,
    'remaining', 0, 'bonus', 0, 'renewal_period', v_period);
END;
$fn$;
GRANT EXECUTE ON FUNCTION public.cosme_check_consume_credit(TEXT) TO authenticated, anon;
