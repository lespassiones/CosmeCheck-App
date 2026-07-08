-- Axe ORGANISATIONNEL matin/soir + ordre manuel de la routine (mobile).
-- ADDITIF : defaults obligatoires pour que les inserts existants (web + mobile actuels)
-- continuent sans changement. Le modele d'EXPOSITION (ponderation par frequence)
-- reste inchange : time_of_day n'influe pas sur les metriques.
-- APPLIQUEE EN PROD le 7 juillet 2026 via MCP (migration routine_time_of_day_v1).
-- Verification post-apply : 57 lignes, toutes 'morning', positions uniques par user.

ALTER TABLE cosme_check.routine_items
  ADD COLUMN IF NOT EXISTS time_of_day text NOT NULL DEFAULT 'morning'
    CONSTRAINT routine_items_time_of_day_check CHECK (time_of_day IN ('morning','evening','both')),
  ADD COLUMN IF NOT EXISTS position integer NOT NULL DEFAULT 0;

-- Backfill : ordre existant = added_at ASC par user (0..n-1), position 1 = premier geste.
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY user_id ORDER BY added_at ASC) - 1 AS rn
  FROM cosme_check.routine_items
)
UPDATE cosme_check.routine_items ri SET position = ranked.rn
FROM ranked WHERE ri.id = ranked.id;

-- RPC batch atomique de reordonnancement : [{ id, time_of_day?, position? }, ...]
-- Owner-scoped (auth.uid()), max 100 elements, valeurs time_of_day invalides ignorees.
CREATE OR REPLACE FUNCTION public.cosme_check_reorder_routine(p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'cosme_check', 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_count int;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated'); END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) > 100 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_payload');
  END IF;

  UPDATE cosme_check.routine_items ri
     SET time_of_day = COALESCE(x.tod, ri.time_of_day),
         position    = COALESCE(x.pos, ri.position)
  FROM (
    SELECT (e->>'id')::uuid AS id,
           CASE WHEN e->>'time_of_day' IN ('morning','evening','both') THEN e->>'time_of_day' END AS tod,
           (e->>'position')::int AS pos
    FROM jsonb_array_elements(p_items) e
    WHERE e ? 'id'
  ) x
  WHERE ri.id = x.id AND ri.user_id = v_user;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'updated', v_count);
END;
$function$;

REVOKE ALL ON FUNCTION public.cosme_check_reorder_routine(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cosme_check_reorder_routine(jsonb) TO authenticated, service_role;
