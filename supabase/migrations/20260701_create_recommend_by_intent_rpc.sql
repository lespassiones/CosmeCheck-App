-- ============================================================================
-- Migration: create_cosme_check_recommend_by_intent RPC
-- Objet: RPC pour recommander des produits basé sur un intent utilisateur
--        (need, body_zone, concern) avec filtrage des restrictions.
--
-- Entrées:
--   p_need: e.g., 'hydration_face', 'odor_control_feet'
--   p_body_zone: e.g., 'face', 'feet' (optionnel)
--   p_exclude_families: array de noms de familles d'ingrédients à exclure
--   p_exclude_ingredients: array de noms d'ingrédients à exclure
--   p_limit: nombre de produits à retourner (défaut 10)
--
-- Sorties: JSON array avec ean, brand, name, score, match_reason, relevance_score
--
-- Logique:
--   1. Lookup product_intent_mapping par need
--   2. Chercher produits dans catalog matching les category_patterns
--   3. Filtrer les restrictions (exclude_families, exclude_ingredients)
--   4. Trier par score DESC, count_total DESC
--   5. Retourner top p_limit
--
-- Sécurité: SECURITY INVOKER, grant execute à authenticated/anon
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cosme_check_recommend_by_intent(
  p_need TEXT,
  p_body_zone TEXT DEFAULT NULL,
  p_exclude_families TEXT[] DEFAULT '{}',
  p_exclude_ingredients TEXT[] DEFAULT '{}',
  p_limit INT DEFAULT 10
)
RETURNS TABLE (
  ean TEXT,
  brand TEXT,
  name TEXT,
  score INT,
  match_reason TEXT,
  relevance_score DECIMAL
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_category_patterns TEXT[];
  v_min_score INT;
  v_zone TEXT;
BEGIN
  -- 1. Lookup intent mapping
  SELECT category_patterns, min_score, COALESCE(body_zone, p_body_zone)
  INTO v_category_patterns, v_min_score, v_zone
  FROM cosme_check.product_intent_mapping
  WHERE need = p_need AND active = true
  LIMIT 1;

  IF v_category_patterns IS NULL THEN
    -- Intent not found, return empty
    RETURN;
  END IF;

  -- 2. Query catalog with restrictions
  RETURN QUERY
  SELECT
    c.ean::TEXT,
    c.brand,
    c.name,
    COALESCE(c.score, 0)::INT,
    FORMAT('Match: %s in %L', p_need, v_category_patterns) AS match_reason,
    (COALESCE(c.score, 0)::DECIMAL / 100.0) AS relevance_score
  FROM cosme_check.catalog c
  WHERE
    -- Category match
    (
      SELECT COUNT(*)
      FROM UNNEST(v_category_patterns) AS pattern
      WHERE LOWER(c.product_category) LIKE LOWER('%' || pattern || '%')
        OR LOWER(c.sub_category) LIKE LOWER('%' || pattern || '%')
        OR LOWER(c.product_type) LIKE LOWER('%' || pattern || '%')
    ) > 0
    -- Score minimum
    AND COALESCE(c.score, 0) >= v_min_score
    -- Exclude restricted families (if INCI contains any)
    AND NOT (
      p_exclude_families != '{}' AND
      EXISTS (
        SELECT 1
        FROM UNNEST(p_exclude_families) AS fam
        WHERE c.ingredients_text ILIKE '%' || fam || '%'
      )
    )
    -- Exclude restricted ingredients
    AND NOT (
      p_exclude_ingredients != '{}' AND
      EXISTS (
        SELECT 1
        FROM UNNEST(p_exclude_ingredients) AS ing
        WHERE c.ingredients_text ILIKE '%' || ing || '%'
      )
    )
  ORDER BY
    COALESCE(c.score, 0) DESC,
    c.count_total DESC,
    c.name ASC
  LIMIT p_limit;
END;
$$;

-- Grant execute to authenticated and anon
GRANT EXECUTE ON FUNCTION public.cosme_check_recommend_by_intent(TEXT, TEXT, TEXT[], TEXT[], INT) TO authenticated, anon;

-- Create public alias for easier calling
CREATE OR REPLACE FUNCTION public.cosme_check_recommend_by_intent(
  p_need TEXT,
  p_body_zone TEXT,
  p_exclude_families TEXT[],
  p_exclude_ingredients TEXT[],
  p_limit INT
)
RETURNS TABLE (
  ean TEXT,
  brand TEXT,
  name TEXT,
  score INT,
  match_reason TEXT,
  relevance_score DECIMAL
) AS $$
  SELECT * FROM public.cosme_check_recommend_by_intent(p_need, p_body_zone, p_exclude_families, p_exclude_ingredients, p_limit);
$$ LANGUAGE SQL SECURITY INVOKER;

GRANT EXECUTE ON FUNCTION public.cosme_check_recommend_by_intent(TEXT, TEXT, TEXT[], TEXT[], INT) TO authenticated, anon;
