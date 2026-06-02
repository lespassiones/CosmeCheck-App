-- ============================================================================
-- Migration : cosme_check_get_routine_tags  (v2 — guard scalar)
-- Objet     : exposer une projection légère de la routine utilisateur, qui
--             agrège les `tags` de chaque produit côté Postgres au lieu de
--             rapatrier tout `result_json` (jusqu'à ~30 KB par ligne).
--
-- Consommateur : Edge Function `advisor-chat` (lit la routine pour fabriquer
-- le prompt système). Avant cette RPC : 12 × ~30 KB = ~360 KB par message.
-- Après    : seulement (name, product_label, score, frequency, tags[]).
--
-- Sécurité : SECURITY INVOKER (RLS s'applique côté tables `routine_items` et
-- `analyses`), grant execute aux rôles `authenticated` et `anon` (un anon ne
-- verra rien à cause de RLS — vérifié).
--
-- IMPORTANT : la v2 garde-foue jsonb_typeof = 'array' AVANT chaque appel à
-- jsonb_array_elements (sinon "cannot extract elements from a scalar" sur
-- les rows où `items` ou `tags` n'est pas un array — observé sur 4/34 rows
-- en prod). Voir post-mortem ci-dessous.
--
-- Post-mortem v1 (sans garde) :
--   Sur des routine_items dont l'analysis stocke `result_json.items[*].tags`
--   en null/scalar (analyses anciennes), `jsonb_array_elements_text(item->'tags')`
--   plantait avec SQLSTATE 22023. La WHERE de la sous-requête filtre désormais
--   ces cas → 0 row de moins en sortie, juste sans tags.
--
-- Idempotente : CREATE OR REPLACE FUNCTION.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cosme_check_get_routine_tags(
  p_limit integer DEFAULT 12
)
RETURNS TABLE (
  name           text,
  product_label  text,
  score          numeric,
  frequency      text,
  tags           text[]
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, cosme_check
AS $$
  SELECT
    a.name,
    a.product_label,
    a.score,
    ri.frequency::text AS frequency,
    COALESCE(
      (
        SELECT array_agg(DISTINCT tag)
        FROM jsonb_array_elements(a.result_json->'items') AS item,
             jsonb_array_elements_text(item->'tags') AS tag
        WHERE jsonb_typeof(a.result_json->'items') = 'array'
          AND jsonb_typeof(item->'tags') = 'array'
      ),
      ARRAY[]::text[]
    ) AS tags
  FROM cosme_check.routine_items ri
  JOIN cosme_check.analyses a ON a.id = ri.analysis_id
  WHERE ri.user_id = auth.uid()
  ORDER BY ri.added_at DESC
  LIMIT GREATEST(p_limit, 0);
$$;

GRANT EXECUTE ON FUNCTION public.cosme_check_get_routine_tags(integer) TO authenticated, anon;

COMMENT ON FUNCTION public.cosme_check_get_routine_tags(integer)
  IS 'Projection légère de la routine de l''utilisateur courant : agrège les `tags` ingrédients DISTINCTS côté Postgres, évite de transférer `result_json` complet. Utilisée par l''Edge Function `advisor-chat`.';
