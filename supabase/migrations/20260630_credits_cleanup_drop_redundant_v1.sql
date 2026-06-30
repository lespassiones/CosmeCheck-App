-- Drop the redundant/duplicate credit RPCs superseded by the canonical core
-- (credits_canonical_core_v1 / credits_admin_rpcs_v1). Targets ONLY the
-- cosme_check schema; public.cosme_check_get_credits / consume_credit and
-- reset_today / update_tier_with_credits (revenuecat) are kept. Confirmed
-- unreferenced across admin/mobile/web app code before dropping.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'cosme_check'
      AND p.proname IN (
        'cosme_check_admin_update_credit_tier',
        'cosme_check_admin_set_user_override',
        'cosme_check_set_user_credit_override',
        'cosme_check_remove_user_credit_override',
        'cosme_check_update_credit_tier',
        'cosme_check_admin_get_user_credits_config',
        'cosme_check_admin_set_daily_limit',
        'cosme_check_admin_set_default_daily_limit',
        'cosme_check_get_credits'
      )
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig::text || ' CASCADE';
  END LOOP;
END $$;
