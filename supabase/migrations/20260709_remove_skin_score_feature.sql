-- Feature « Score de peau / Scan visage » ABANDONNÉE et retirée (mobile only, 9 juil 2026).
-- Appliquée en prod via MCP apply_migration (name: remove_skin_score_feature).
--
-- Contexte : la fonctionnalité (jugement holistique gpt-4o-mini non reproductible)
-- a été abandonnée. Tout le code client (écrans app/peau/*, composants components/peau/*,
-- hooks/useSkinScore, lib/skin/{score,graph,api,events}) a été supprimé. Les blocs
-- « Score de peau » de l'Accueil et de l'onglet Routine ont été retirés.
--
-- Objets PROD supprimés hors de ce fichier (impossible en SQL pur) :
--   * bucket privé `skin-photos` + toutes les photos  -> Storage API (POST .../empty + DELETE bucket)
--   * cron `cosme_check_send_weekly_bilan` (jobid 13)  -> SELECT cron.unschedule(13)
--   * Edge `face-analyze` + `send-weekly-bilan`        -> sources retirées du repo ;
--     restent déployées mais INERTES (client n'appelle plus, cron désactivé) ->
--     à undeploy via le dashboard ou `supabase functions delete <name>` si souhaité.
--
-- Objets PARTAGÉS conservés (utilisés ailleurs, NE PAS toucher) :
--   * RPC cosme_check_consume_credit(p_feature, p_count)  (crédits, général)
--   * app_config.flag_skin_score + notif_bilan_weekday/hour (dormants, sans effet ;
--     laissés en place pour ne pas réécrire get_app_config/admin_set_app_config)
--   * lib/skin/profile.ts + lib/skin/week.ts (profil onboarding + ISO week, partagés)

DROP TABLE IF EXISTS cosme_check.face_scans;
DROP TABLE IF EXISTS cosme_check.skin_checkins;
