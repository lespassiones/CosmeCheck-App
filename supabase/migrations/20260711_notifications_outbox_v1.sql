-- notifications_outbox_v1 — moteur d'envoi de notifications push (Expo Push).
-- File d'envoi + historique alimentee par l'admin (campagnes manuelles) ou un
-- planner (scenarios auto), videe par l'edge `push-dispatch` declenchee par un
-- cron (pg_cron -> pg_net -> edge). APPLIQUEE EN PROD via MCP le 11 juil 2026.

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 1. Table outbox : une ligne = une notif destinee a un utilisateur.
CREATE TABLE IF NOT EXISTS cosme_check.notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scenario text NOT NULL DEFAULT 'manual',
  title text NOT NULL,
  body text NOT NULL,
  deeplink text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending'
    CONSTRAINT notif_outbox_status_chk CHECK (status IN ('pending','sent','failed','skipped','canceled')),
  attempts int NOT NULL DEFAULT 0,
  sent_at timestamptz,
  error text,
  dedup_key text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notif_outbox_due
  ON cosme_check.notification_outbox(scheduled_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_notif_outbox_user
  ON cosme_check.notification_outbox(user_id);
CREATE INDEX IF NOT EXISTS idx_notif_outbox_created
  ON cosme_check.notification_outbox(created_at DESC);
-- Anti-doublon pour les scenarios auto (ex. un seul winback J+7 par user/jour).
CREATE UNIQUE INDEX IF NOT EXISTS uq_notif_outbox_dedup
  ON cosme_check.notification_outbox(dedup_key) WHERE dedup_key IS NOT NULL;

ALTER TABLE cosme_check.notification_outbox ENABLE ROW LEVEL SECURITY;
-- Server-role uniquement (comme rate_limits/idempotency) : aucune policy client.
REVOKE ALL ON cosme_check.notification_outbox FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON cosme_check.notification_outbox TO service_role;

-- 2. Config de dispatch (URL edge + secret partage) — jamais expose au client.
CREATE TABLE IF NOT EXISTS cosme_check.notif_dispatch_config (
  id int PRIMARY KEY DEFAULT 1 CONSTRAINT notif_dispatch_singleton CHECK (id = 1),
  edge_url text NOT NULL,
  secret text NOT NULL
);
ALTER TABLE cosme_check.notif_dispatch_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cosme_check.notif_dispatch_config FROM anon, authenticated;
GRANT SELECT ON cosme_check.notif_dispatch_config TO service_role;

-- 3. Audience : user_ids JOIGNABLES (avec token push) pour un segment donne.
--    On ne cible QUE les porteurs de token (sinon la notif ne peut pas arriver).
CREATE OR REPLACE FUNCTION public.cosme_check_admin_notif_audience(p_segment text)
RETURNS TABLE(user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'cosme_check','public' AS $fn$
  WITH tokened AS (SELECT DISTINCT pt.user_id AS uid FROM cosme_check.push_tokens pt)
  SELECT t.uid FROM tokened t
  WHERE CASE p_segment
    WHEN 'all'          THEN true
    WHEN 'has_token'    THEN true
    WHEN 'free'         THEN EXISTS (SELECT 1 FROM cosme_check.user_profiles up WHERE up.id = t.uid AND COALESCE(up.tier,'free') = 'free')
    WHEN 'premium'      THEN EXISTS (SELECT 1 FROM cosme_check.user_profiles up WHERE up.id = t.uid AND up.tier = 'premium')
    WHEN 'no_scan'      THEN NOT EXISTS (SELECT 1 FROM cosme_check.analyses a WHERE a.user_id = t.uid)
    WHEN 'no_routine'   THEN EXISTS (SELECT 1 FROM cosme_check.analyses a WHERE a.user_id = t.uid)
                             AND NOT EXISTS (SELECT 1 FROM cosme_check.routine_items r WHERE r.user_id = t.uid)
    WHEN 'inactive_7d'  THEN COALESCE((SELECT max(a.created_at) FROM cosme_check.analyses a WHERE a.user_id = t.uid), 'epoch'::timestamptz) < now() - interval '7 days'
    WHEN 'inactive_14d' THEN COALESCE((SELECT max(a.created_at) FROM cosme_check.analyses a WHERE a.user_id = t.uid), 'epoch'::timestamptz) < now() - interval '14 days'
    WHEN 'inactive_30d' THEN COALESCE((SELECT max(a.created_at) FROM cosme_check.analyses a WHERE a.user_id = t.uid), 'epoch'::timestamptz) < now() - interval '30 days'
    ELSE false
  END;
$fn$;

-- 4. Preview (dry-run) : total + echantillon, sans rien inserer.
CREATE OR REPLACE FUNCTION public.cosme_check_admin_notif_preview(p_segment text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'cosme_check','public' AS $fn$
DECLARE v_total int; v_sample jsonb;
BEGIN
  SELECT count(*) INTO v_total FROM public.cosme_check_admin_notif_audience(p_segment);
  SELECT COALESCE(jsonb_agg(s), '[]'::jsonb) INTO v_sample FROM (
    SELECT a.user_id, up.first_name, u.email
    FROM public.cosme_check_admin_notif_audience(p_segment) a
    LEFT JOIN cosme_check.user_profiles up ON up.id = a.user_id
    LEFT JOIN auth.users u ON u.id = a.user_id
    LIMIT 20
  ) s;
  RETURN jsonb_build_object('total', v_total, 'sample', v_sample);
END;
$fn$;

-- 5. Enqueue : insere la notif pour toute l'audience. Retourne le nb enfile.
CREATE OR REPLACE FUNCTION public.cosme_check_admin_notif_enqueue(
  p_segment text,
  p_title text,
  p_body text,
  p_deeplink text DEFAULT NULL,
  p_scenario text DEFAULT 'manual',
  p_scheduled_at timestamptz DEFAULT now(),
  p_admin text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'cosme_check','public' AS $fn$
DECLARE v_count int;
BEGIN
  IF p_title IS NULL OR length(trim(p_title)) = 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'title_required'); END IF;
  IF p_body  IS NULL OR length(trim(p_body))  = 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'body_required');  END IF;
  INSERT INTO cosme_check.notification_outbox (user_id, scenario, title, body, deeplink, scheduled_at, created_by)
  SELECT a.user_id, COALESCE(p_scenario,'manual'), trim(p_title), trim(p_body), p_deeplink, COALESCE(p_scheduled_at, now()), p_admin
  FROM public.cosme_check_admin_notif_audience(p_segment) a;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'queued', v_count);
END;
$fn$;

-- 6. Test : envoie a un seul utilisateur (par email). Utilise pour "test sur moi".
CREATE OR REPLACE FUNCTION public.cosme_check_admin_notif_test(
  p_email text, p_title text, p_body text, p_deeplink text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'cosme_check','public' AS $fn$
DECLARE v_uid uuid; v_has_token boolean;
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE lower(email) = lower(trim(p_email)) LIMIT 1;
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'user_not_found'); END IF;
  SELECT EXISTS(SELECT 1 FROM cosme_check.push_tokens WHERE user_id = v_uid) INTO v_has_token;
  INSERT INTO cosme_check.notification_outbox (user_id, scenario, title, body, deeplink, scheduled_at, created_by)
  VALUES (v_uid, 'test', trim(p_title), trim(p_body), p_deeplink, now(), p_email);
  RETURN jsonb_build_object('ok', true, 'user_id', v_uid, 'has_token', v_has_token);
END;
$fn$;

-- 7. Declencheur pg_net vers l'edge push-dispatch (fire-and-forget).
CREATE OR REPLACE FUNCTION cosme_check.dispatch_due_notifications()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'cosme_check','public','net' AS $fn$
DECLARE v_url text; v_secret text;
BEGIN
  SELECT edge_url, secret INTO v_url, v_secret FROM cosme_check.notif_dispatch_config WHERE id = 1;
  IF v_url IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(
    url     := v_url,
    body    := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type','application/json','x-dispatch-secret', v_secret)
  );
END;
$fn$;

-- Wrapper public "envoyer maintenant" pour l'admin.
CREATE OR REPLACE FUNCTION public.cosme_check_admin_notif_dispatch_now()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'cosme_check','public' AS $fn$
BEGIN
  PERFORM cosme_check.dispatch_due_notifications();
  RETURN jsonb_build_object('ok', true);
END;
$fn$;

-- 8. Historique agrege (une ligne par campagne) pour l'admin.
CREATE OR REPLACE FUNCTION public.cosme_check_admin_notif_history(p_limit int DEFAULT 100)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'cosme_check','public' AS $fn$
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
    SELECT scenario, title, body, deeplink,
      count(*)                                   AS total,
      count(*) FILTER (WHERE status = 'sent')    AS sent,
      count(*) FILTER (WHERE status = 'failed')  AS failed,
      count(*) FILTER (WHERE status = 'pending') AS pending,
      count(*) FILTER (WHERE status = 'skipped') AS skipped,
      min(scheduled_at) AS scheduled_at,
      max(created_at)   AS created_at
    FROM cosme_check.notification_outbox
    GROUP BY scenario, title, body, deeplink
    ORDER BY max(created_at) DESC
    LIMIT GREATEST(1, LEAST(p_limit, 500))
  ) t;
$fn$;

-- Grants : server-role uniquement (l'admin utilise la clef service_role).
REVOKE ALL ON FUNCTION public.cosme_check_admin_notif_audience(text)      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cosme_check_admin_notif_preview(text)       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cosme_check_admin_notif_enqueue(text,text,text,text,text,timestamptz,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cosme_check_admin_notif_test(text,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cosme_check_admin_notif_dispatch_now()      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cosme_check_admin_notif_history(int)        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION cosme_check.dispatch_due_notifications()           FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.cosme_check_admin_notif_audience(text)      TO service_role;
GRANT EXECUTE ON FUNCTION public.cosme_check_admin_notif_preview(text)       TO service_role;
GRANT EXECUTE ON FUNCTION public.cosme_check_admin_notif_enqueue(text,text,text,text,text,timestamptz,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.cosme_check_admin_notif_test(text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.cosme_check_admin_notif_dispatch_now()      TO service_role;
GRANT EXECUTE ON FUNCTION public.cosme_check_admin_notif_history(int)        TO service_role;
GRANT EXECUTE ON FUNCTION cosme_check.dispatch_due_notifications()           TO service_role;

-- 9. Statut transitoire 'sending' + claim atomique (anti double-envoi cron/manuel).
ALTER TABLE cosme_check.notification_outbox DROP CONSTRAINT IF EXISTS notif_outbox_status_chk;
ALTER TABLE cosme_check.notification_outbox
  ADD CONSTRAINT notif_outbox_status_chk
  CHECK (status IN ('pending','sending','sent','failed','skipped','canceled'));

CREATE OR REPLACE FUNCTION public.cosme_check_claim_due_notifications(p_limit int DEFAULT 500)
RETURNS TABLE(id uuid, user_id uuid, title text, body text, deeplink text, data jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'cosme_check','public' AS $fn$
BEGIN
  UPDATE cosme_check.notification_outbox
    SET status = 'pending'
    WHERE status = 'sending' AND scheduled_at < now() - interval '15 minutes';
  RETURN QUERY
  WITH due AS (
    SELECT o.id
    FROM cosme_check.notification_outbox o
    WHERE o.status = 'pending' AND o.scheduled_at <= now()
    ORDER BY o.scheduled_at
    LIMIT GREATEST(1, LEAST(p_limit, 1000))
    FOR UPDATE SKIP LOCKED
  )
  UPDATE cosme_check.notification_outbox o2
    SET status = 'sending', attempts = o2.attempts + 1
  FROM due
  WHERE o2.id = due.id
  RETURNING o2.id, o2.user_id, o2.title, o2.body, o2.deeplink, o2.data;
END;
$fn$;

REVOKE ALL ON FUNCTION public.cosme_check_claim_due_notifications(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cosme_check_claim_due_notifications(int) TO service_role;
