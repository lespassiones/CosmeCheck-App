-- notifications_planner_v1 — Phase C : planner automatique de scenarios.
-- Cote serveur uniquement (aucun rebuild mobile). OFF par defaut : rien ne
-- s'enfile tant que app_config.notif_planner_enabled n'est pas passe a true.
-- APPLIQUEE EN PROD via MCP le 11 juil 2026.

-- 1. Flag maitre (OFF).
ALTER TABLE cosme_check.app_config
  ADD COLUMN IF NOT EXISTS notif_planner_enabled boolean NOT NULL DEFAULT false;

-- 2. Table des scenarios (segment + variantes de message). Editable par l'admin.
CREATE TABLE IF NOT EXISTS cosme_check.notification_scenarios (
  key text PRIMARY KEY,
  label text NOT NULL,
  description text,
  segment text NOT NULL,
  deeplink text,
  variants jsonb NOT NULL DEFAULT '[]'::jsonb,
  priority int NOT NULL DEFAULT 100,
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE cosme_check.notification_scenarios ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cosme_check.notification_scenarios FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON cosme_check.notification_scenarios TO service_role;

-- 3. Fix audience : les segments "inactifs" excluent ceux qui n'ont JAMAIS
--    scanne (sinon un no_scan matcherait aussi winback). inactif = a deja
--    scanne AU MOINS une fois ET pas depuis N jours.
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
    WHEN 'inactive_7d'  THEN EXISTS (SELECT 1 FROM cosme_check.analyses a WHERE a.user_id = t.uid)
                             AND (SELECT max(a.created_at) FROM cosme_check.analyses a WHERE a.user_id = t.uid) < now() - interval '7 days'
    WHEN 'inactive_14d' THEN EXISTS (SELECT 1 FROM cosme_check.analyses a WHERE a.user_id = t.uid)
                             AND (SELECT max(a.created_at) FROM cosme_check.analyses a WHERE a.user_id = t.uid) < now() - interval '14 days'
    WHEN 'inactive_30d' THEN EXISTS (SELECT 1 FROM cosme_check.analyses a WHERE a.user_id = t.uid)
                             AND (SELECT max(a.created_at) FROM cosme_check.analyses a WHERE a.user_id = t.uid) < now() - interval '30 days'
    ELSE false
  END;
$fn$;

-- 4. Seed des scenarios (variantes multiples). ON CONFLICT DO NOTHING : on ne
--    reecrase pas les eventuelles editions admin.
INSERT INTO cosme_check.notification_scenarios (key, label, description, segment, deeplink, priority, variants) VALUES
('reactivation_30d', 'Reactivation 30 jours', 'Utilisateurs ayant scanne mais inactifs depuis 30 jours.', 'inactive_30d', '/(tabs)', 10,
  '[{"title":"Ton decrypteur cosmetique t attend","body":"Un mois sans scan. Reviens voir ce qui a change dans ton analyse."},
    {"title":"Reprends le controle de ta routine","body":"En 10 secondes, sache si tes produits te conviennent vraiment."}]'::jsonb),
('winback_14d', 'Win-back 14 jours', 'Utilisateurs inactifs depuis 14 jours.', 'inactive_14d', '/(tabs)', 20,
  '[{"title":"Ca fait deux semaines...","body":"Reviens verifier la compo de tes produits, c est l affaire d un instant."},
    {"title":"Tes cosmetiques n ont pas de secret","body":"Reprends tes analyses la ou tu t es arrete."}]'::jsonb),
('winback_7d', 'Win-back 7 jours', 'Utilisateurs inactifs depuis 7 jours.', 'inactive_7d', '/(tabs)', 30,
  '[{"title":"Un nouveau produit chez toi ?","body":"Verifie sa composition en 10 secondes avant de l adopter."},
    {"title":"Ta salle de bain a change ?","body":"Scanne tes derniers achats et vois ce qu ils contiennent vraiment."},
    {"title":"On t a manque ?","body":"Un scan rapide pour repartir du bon pied cote cosmetiques."}]'::jsonb),
('onboarding_no_scan', 'Onboarding sans scan', 'Inscrits qui n ont jamais scanne.', 'no_scan', '/(tabs)', 40,
  '[{"title":"Ton premier scan t attend","body":"Decouvre ce que contient vraiment ton cosmetique prefere."},
    {"title":"Pret a decrypter tes produits ?","body":"Scanne un produit et obtiens une analyse claire, en 10 secondes."}]'::jsonb),
('routine_empty', 'Routine vide', 'Ont scanne mais n ont pas de routine.', 'no_routine', '/(tabs)/routine', 50,
  '[{"title":"Construis ta routine ideale","body":"Ajoute tes produits pour reperer les conflits et suivre ta routine."},
    {"title":"Tes produits, au meme endroit","body":"Cree ta routine et laisse CosmeCheck veiller sur les incompatibilites."}]'::jsonb),
('weekly_digest_premium', 'Digest hebdo (premium)', 'Rappel hebdomadaire pour les abonnes premium.', 'premium', '/(tabs)', 60,
  '[{"title":"Ton point beaute de la semaine","body":"Un rappel pour verifier tes nouveautes et garder une routine au top."},
    {"title":"Nouvelle semaine, nouveaux scans","body":"Prends 2 minutes pour analyser tes derniers produits."}]'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 5. Planner : parcourt les scenarios actifs par priorite, deduplique les users
--    deja cibles ce run (exclusivite : un user ne recoit qu'UNE notif/run, la
--    plus prioritaire), choisit une variante deterministe et enfile (dedup
--    hebdo). p_dry_run = true : compte seulement, ignore le flag maitre.
CREATE OR REPLACE FUNCTION public.cosme_check_run_notif_planner(p_dry_run boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'cosme_check','public' AS $fn$
DECLARE
  v_enabled boolean;
  v_week text := to_char(now(), 'IYYY"W"IW');
  v_scn record;
  v_nvar int;
  v_count int;
  v_queued int;
  v_result jsonb := '[]'::jsonb;
BEGIN
  SELECT notif_planner_enabled INTO v_enabled FROM cosme_check.app_config WHERE id = 1;
  IF NOT p_dry_run AND COALESCE(v_enabled, false) = false THEN
    RETURN jsonb_build_object('ok', false, 'error', 'planner_disabled');
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _planner_targeted (uid uuid PRIMARY KEY) ON COMMIT DROP;
  DELETE FROM _planner_targeted;

  FOR v_scn IN
    SELECT key, segment, deeplink, variants
    FROM cosme_check.notification_scenarios
    WHERE enabled = true
    ORDER BY priority ASC, key ASC
  LOOP
    v_nvar := GREATEST(1, jsonb_array_length(v_scn.variants));

    SELECT count(*) INTO v_count
    FROM public.cosme_check_admin_notif_audience(v_scn.segment) a
    WHERE NOT EXISTS (SELECT 1 FROM _planner_targeted t WHERE t.uid = a.user_id);

    v_queued := 0;
    IF NOT p_dry_run AND v_count > 0 THEN
      WITH aud AS (
        SELECT a.user_id AS uid
        FROM public.cosme_check_admin_notif_audience(v_scn.segment) a
        WHERE NOT EXISTS (SELECT 1 FROM _planner_targeted t WHERE t.uid = a.user_id)
      ), ins AS (
        INSERT INTO cosme_check.notification_outbox (user_id, scenario, title, body, deeplink, scheduled_at, dedup_key, created_by)
        SELECT
          aud.uid,
          v_scn.key,
          (v_scn.variants -> (abs(hashtext(aud.uid::text)) % v_nvar) ->> 'title'),
          (v_scn.variants -> (abs(hashtext(aud.uid::text)) % v_nvar) ->> 'body'),
          v_scn.deeplink,
          now(),
          v_scn.key || ':' || aud.uid::text || ':' || v_week,
          'planner'
        FROM aud
        ON CONFLICT (dedup_key) DO NOTHING
        RETURNING 1
      )
      SELECT count(*) INTO v_queued FROM ins;
    END IF;

    -- Marque toute l'audience comme cible ce run (exclusivite entre scenarios).
    INSERT INTO _planner_targeted (uid)
      SELECT a.user_id FROM public.cosme_check_admin_notif_audience(v_scn.segment) a
      ON CONFLICT DO NOTHING;

    v_result := v_result || jsonb_build_object('scenario', v_scn.key, 'audience', v_count, 'queued', v_queued);
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'dry_run', p_dry_run, 'week', v_week, 'scenarios', v_result);
END;
$fn$;

-- 6. RPC admin : liste des scenarios + audience + flag maitre.
CREATE OR REPLACE FUNCTION public.cosme_check_admin_notif_scenarios()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'cosme_check','public' AS $fn$
DECLARE v_enabled boolean; v_list jsonb;
BEGIN
  SELECT notif_planner_enabled INTO v_enabled FROM cosme_check.app_config WHERE id = 1;
  SELECT COALESCE(jsonb_agg(row_to_json(s) ORDER BY s.priority), '[]'::jsonb) INTO v_list FROM (
    SELECT sc.key, sc.label, sc.description, sc.segment, sc.deeplink, sc.variants, sc.priority, sc.enabled,
           (SELECT count(*) FROM public.cosme_check_admin_notif_audience(sc.segment)) AS audience
    FROM cosme_check.notification_scenarios sc
    ORDER BY sc.priority
  ) s;
  RETURN jsonb_build_object('planner_enabled', COALESCE(v_enabled,false), 'scenarios', v_list);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.cosme_check_admin_set_notif_planner(p_enabled boolean)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'cosme_check','public' AS $fn$
BEGIN
  UPDATE cosme_check.app_config SET notif_planner_enabled = COALESCE(p_enabled,false), updated_at = now() WHERE id = 1;
  RETURN jsonb_build_object('ok', true, 'planner_enabled', COALESCE(p_enabled,false));
END;
$fn$;

CREATE OR REPLACE FUNCTION public.cosme_check_admin_set_scenario(p_key text, p_enabled boolean)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'cosme_check','public' AS $fn$
BEGIN
  UPDATE cosme_check.notification_scenarios SET enabled = COALESCE(p_enabled,false), updated_at = now() WHERE key = p_key;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'scenario_not_found'); END IF;
  RETURN jsonb_build_object('ok', true, 'key', p_key, 'enabled', COALESCE(p_enabled,false));
END;
$fn$;

-- Grants (server-role only).
REVOKE ALL ON FUNCTION public.cosme_check_run_notif_planner(boolean)        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cosme_check_admin_notif_scenarios()           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cosme_check_admin_set_notif_planner(boolean)  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cosme_check_admin_set_scenario(text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cosme_check_run_notif_planner(boolean)        TO service_role;
GRANT EXECUTE ON FUNCTION public.cosme_check_admin_notif_scenarios()           TO service_role;
GRANT EXECUTE ON FUNCTION public.cosme_check_admin_set_notif_planner(boolean)  TO service_role;
GRANT EXECUTE ON FUNCTION public.cosme_check_admin_set_scenario(text, boolean) TO service_role;

-- 7. Cron quotidien 09:00 UTC (inerte tant que le flag maitre est OFF).
SELECT cron.schedule('cosme_check_run_notif_planner', '0 9 * * *', 'select public.cosme_check_run_notif_planner(false);');
