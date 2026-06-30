-- Canonical admin RPCs for the credit system (called by CosmeCheckAdmin with the
-- service role / requireAdmin). Pure data ops; admin server actions add audit logging.
--   cosme_check_admin_grant_credits   — one-off additive bonus (negative = revoke FIFO)
--   cosme_check_admin_set_override     — per-user override of tier config
--   cosme_check_admin_clear_override   — revert to tier config
--   cosme_check_admin_set_tier         — set free/premium tier config
--   cosme_check_admin_users_overview   — per-user effective config + usage + bonus (list page)
--   cosme_check_admin_user_credits     — full per-user state + grants (detail page)

CREATE OR REPLACE FUNCTION cosme_check.cosme_check_admin_grant_credits(
  p_user_id UUID, p_amount INT, p_note TEXT DEFAULT NULL, p_admin TEXT DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = cosme_check, public AS $fn$
BEGIN
  IF p_amount IS NULL OR p_amount = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'amount must be non-zero');
  END IF;
  IF p_amount > 0 THEN
    INSERT INTO cosme_check.credit_grants(user_id, amount, remaining, note, created_by)
    VALUES (p_user_id, p_amount, p_amount, p_note, p_admin);
  ELSE
    DECLARE v_to_revoke INT := -p_amount; v_take INT; r RECORD;
    BEGIN
      FOR r IN SELECT id, remaining FROM cosme_check.credit_grants
               WHERE user_id = p_user_id AND remaining > 0 ORDER BY created_at ASC LOOP
        EXIT WHEN v_to_revoke <= 0;
        v_take := LEAST(r.remaining, v_to_revoke);
        UPDATE cosme_check.credit_grants SET remaining = remaining - v_take WHERE id = r.id;
        v_to_revoke := v_to_revoke - v_take;
      END LOOP;
    END;
  END IF;
  RETURN cosme_check.credit_state(p_user_id) || jsonb_build_object('granted', p_amount);
END;
$fn$;
GRANT EXECUTE ON FUNCTION cosme_check.cosme_check_admin_grant_credits(UUID, INT, TEXT, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION cosme_check.cosme_check_admin_set_override(
  p_user_id UUID, p_credit_amount INT, p_renewal_period TEXT)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = cosme_check, public AS $fn$
DECLARE v_days INT;
BEGIN
  IF p_renewal_period NOT IN ('one_time','daily','weekly','monthly','yearly') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid renewal_period');
  END IF;
  v_days := cosme_check.credit_interval_days(p_renewal_period);
  INSERT INTO cosme_check.user_credits_override(user_id, credit_amount, renewal_period, renewal_interval_days, active, updated_at)
  VALUES (p_user_id, p_credit_amount, p_renewal_period, v_days, true, now())
  ON CONFLICT (user_id) DO UPDATE SET
    credit_amount = EXCLUDED.credit_amount, renewal_period = EXCLUDED.renewal_period,
    renewal_interval_days = EXCLUDED.renewal_interval_days, active = true, updated_at = now();
  RETURN jsonb_build_object('ok', true) || cosme_check.credit_state(p_user_id);
END;
$fn$;
GRANT EXECUTE ON FUNCTION cosme_check.cosme_check_admin_set_override(UUID, INT, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION cosme_check.cosme_check_admin_clear_override(p_user_id UUID)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = cosme_check, public AS $fn$
BEGIN
  UPDATE cosme_check.user_credits_override SET active = false, updated_at = now() WHERE user_id = p_user_id;
  RETURN jsonb_build_object('ok', true) || cosme_check.credit_state(p_user_id);
END;
$fn$;
GRANT EXECUTE ON FUNCTION cosme_check.cosme_check_admin_clear_override(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION cosme_check.cosme_check_admin_set_tier(
  p_tier TEXT, p_credit_amount INT, p_renewal_period TEXT)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = cosme_check, public AS $fn$
DECLARE v_days INT;
BEGIN
  IF p_renewal_period NOT IN ('one_time','daily','weekly','monthly','yearly') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid renewal_period');
  END IF;
  v_days := cosme_check.credit_interval_days(p_renewal_period);
  INSERT INTO cosme_check.credit_tiers(tier, credit_amount, renewal_period, renewal_interval_days, updated_at)
  VALUES (p_tier, p_credit_amount, p_renewal_period, v_days, now())
  ON CONFLICT (tier) DO UPDATE SET
    credit_amount = EXCLUDED.credit_amount, renewal_period = EXCLUDED.renewal_period,
    renewal_interval_days = EXCLUDED.renewal_interval_days, updated_at = now();
  RETURN jsonb_build_object('ok', true, 'tier', p_tier, 'credit_amount', p_credit_amount,
    'renewal_period', p_renewal_period, 'renewal_interval_days', v_days);
END;
$fn$;
GRANT EXECUTE ON FUNCTION cosme_check.cosme_check_admin_set_tier(TEXT, INT, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION cosme_check.cosme_check_admin_users_overview()
RETURNS TABLE(user_id UUID, tier TEXT, has_override BOOLEAN, credit_amount INT,
  renewal_period TEXT, used_period INT, bonus INT, remaining INT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = cosme_check, public AS $fn$
BEGIN
  RETURN QUERY
  WITH cfg AS (
    SELECT up.id AS uid, up.tier::text AS tier, (o.user_id IS NOT NULL) AS has_override,
      COALESCE(o.credit_amount, ct.credit_amount, 5) AS amount,
      COALESCE(o.renewal_period, ct.renewal_period, 'daily')::text AS period
    FROM cosme_check.user_profiles up
    LEFT JOIN cosme_check.user_credits_override o ON o.user_id = up.id AND o.active = true
    LEFT JOIN cosme_check.credit_tiers ct ON ct.tier = up.tier
  )
  SELECT c.uid, c.tier, c.has_override, c.amount, c.period,
    COALESCE((SELECT SUM(uc.used)::int FROM cosme_check.user_credits uc
              WHERE uc.user_id = c.uid AND uc.day >= cosme_check.credit_period_start(c.period, CURRENT_DATE)), 0),
    COALESCE((SELECT SUM(g.remaining)::int FROM cosme_check.credit_grants g
              WHERE g.user_id = c.uid AND g.remaining > 0), 0),
    GREATEST(0, c.amount - COALESCE((SELECT SUM(uc.used)::int FROM cosme_check.user_credits uc
              WHERE uc.user_id = c.uid AND uc.day >= cosme_check.credit_period_start(c.period, CURRENT_DATE)), 0))
      + COALESCE((SELECT SUM(g.remaining)::int FROM cosme_check.credit_grants g
              WHERE g.user_id = c.uid AND g.remaining > 0), 0)
  FROM cfg c;
END;
$fn$;
GRANT EXECUTE ON FUNCTION cosme_check.cosme_check_admin_users_overview() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION cosme_check.cosme_check_admin_user_credits(p_user_id UUID)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = cosme_check, public AS $fn$
DECLARE v_state jsonb; v_grants jsonb; v_has_override BOOLEAN;
BEGIN
  v_state := cosme_check.credit_state(p_user_id);
  SELECT EXISTS(SELECT 1 FROM cosme_check.user_credits_override o WHERE o.user_id = p_user_id AND o.active = true)
    INTO v_has_override;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', g.id, 'amount', g.amount, 'remaining', g.remaining,
      'note', g.note, 'created_by', g.created_by, 'created_at', g.created_at) ORDER BY g.created_at DESC), '[]'::jsonb)
    INTO v_grants FROM cosme_check.credit_grants g WHERE g.user_id = p_user_id;
  RETURN v_state || jsonb_build_object('has_override', v_has_override, 'grants', v_grants);
END;
$fn$;
GRANT EXECUTE ON FUNCTION cosme_check.cosme_check_admin_user_credits(UUID) TO authenticated, service_role;
