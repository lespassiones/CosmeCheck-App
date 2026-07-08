-- Debit multi-credits retro-compatible : ajoute p_count (defaut 1) a la RPC canonique.
-- Tous les appels existants { p_feature } (web + mobile + edge) restent inchanges.
-- Base : definition live du 30 juin 2026 (periodes + grants bonus), avec en plus :
--  - verrou FOR UPDATE de la ligne du jour pour serialiser les debits concurrents
--  - debit atomique de p_count credits (periode d'abord, puis grants bonus FIFO)
--  - tout ou rien : si le solde total < p_count, aucun debit.
-- APPLIQUEE EN PROD le 7 juillet 2026 via MCP (migration consume_credit_count_v1).

DROP FUNCTION IF EXISTS public.cosme_check_consume_credit(text);

CREATE OR REPLACE FUNCTION public.cosme_check_consume_credit(p_feature text DEFAULT NULL::text, p_count integer DEFAULT 1)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'cosme_check', 'public'
AS $function$
DECLARE
  v_user UUID := auth.uid();
  v_limit INT; v_period TEXT; v_interval INT; v_src TEXT;
  v_pstart DATE; v_used INT; v_bonus INT; v_need INT; v_from_period INT; v_take INT;
  g RECORD;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated'); END IF;
  IF p_count IS NULL OR p_count < 1 THEN p_count := 1; END IF;
  IF p_count > 10 THEN p_count := 10; END IF; -- garde-fou

  SELECT credit_amount, renewal_period, renewal_interval_days, source
    INTO v_limit, v_period, v_interval, v_src
    FROM cosme_check.credit_config_for(v_user);
  IF v_limit IS NULL THEN v_limit := 5; v_period := 'daily'; v_interval := 1; END IF;
  v_pstart := cosme_check.credit_period_start(v_period, CURRENT_DATE);

  INSERT INTO cosme_check.user_credits(user_id, day) VALUES (v_user, CURRENT_DATE)
    ON CONFLICT (user_id, day) DO NOTHING;

  -- Verrou de la ligne du jour : serialise les debits concurrents du meme user.
  PERFORM 1 FROM cosme_check.user_credits WHERE user_id = v_user AND day = CURRENT_DATE FOR UPDATE;

  SELECT COALESCE(SUM(uc.used), 0) INTO v_used FROM cosme_check.user_credits uc
    WHERE uc.user_id = v_user AND uc.day >= v_pstart;
  SELECT COALESCE(SUM(cg.remaining), 0) INTO v_bonus FROM cosme_check.credit_grants cg
    WHERE cg.user_id = v_user AND cg.remaining > 0;

  IF (GREATEST(0, v_limit - v_used) + v_bonus) < p_count THEN
    RETURN jsonb_build_object('ok', false, 'used', v_used, 'limit', v_limit,
      'remaining', GREATEST(0, v_limit - v_used) + v_bonus, 'bonus', v_bonus,
      'renewal_period', v_period);
  END IF;

  v_from_period := LEAST(p_count, GREATEST(0, v_limit - v_used));
  IF v_from_period > 0 THEN
    UPDATE cosme_check.user_credits SET used = used + v_from_period
      WHERE user_id = v_user AND day = CURRENT_DATE;
  END IF;

  v_need := p_count - v_from_period;
  FOR g IN SELECT id, remaining FROM cosme_check.credit_grants
    WHERE user_id = v_user AND remaining > 0 ORDER BY created_at ASC FOR UPDATE
  LOOP
    EXIT WHEN v_need <= 0;
    v_take := LEAST(g.remaining, v_need);
    UPDATE cosme_check.credit_grants SET remaining = remaining - v_take WHERE id = g.id;
    v_need := v_need - v_take;
  END LOOP;

  SELECT COALESCE(SUM(uc.used), 0) INTO v_used FROM cosme_check.user_credits uc
    WHERE uc.user_id = v_user AND uc.day >= v_pstart;
  SELECT COALESCE(SUM(cg.remaining), 0) INTO v_bonus FROM cosme_check.credit_grants cg
    WHERE cg.user_id = v_user AND cg.remaining > 0;

  RETURN jsonb_build_object('ok', true, 'used', v_used, 'limit', v_limit,
    'remaining', GREATEST(0, v_limit - v_used) + v_bonus, 'bonus', v_bonus,
    'renewal_period', v_period, 'from_bonus', v_from_period < p_count);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.cosme_check_consume_credit(text, integer) TO authenticated, anon, service_role;
