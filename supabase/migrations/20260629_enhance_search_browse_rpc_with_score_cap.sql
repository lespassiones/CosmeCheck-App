-- Enhance cosme_check_search_catalog + cosme_check_browse_subcategory
-- to JOIN product_score_cap and return count_orange, count_rouge
-- (29 juin 2026)

-- Note: These RPC definitions assume the existing plpgsql logic.
-- We're extending the SELECT to include score_cap data.

CREATE OR REPLACE FUNCTION cosme_check_search_catalog(
  p_query text,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  ean text,
  brand text,
  name text,
  category text,
  image_url text,
  source_url text,
  score numeric,
  score_label text,
  score_tone text,
  count_total bigint,
  count_orange bigint,
  count_rouge bigint,
  ingredients_text text
)
LANGUAGE plpgsql
AS $$
BEGIN
  -- Token-based search with trigram index on catalog_search_unaccent_trgm
  -- Joined with product_score_cap for color cap data
  RETURN QUERY
  SELECT
    c.ean::text,
    c.brand::text,
    c.name::text,
    c.category::text,
    c.image_url::text,
    c.source_url::text,
    c.score::numeric,
    c.score_label::text,
    c.score_tone::text,
    c.count_total::bigint,
    COALESCE(psc.count_orange, 0)::bigint AS count_orange,
    COALESCE(psc.count_rouge, 0)::bigint AS count_rouge,
    c.ingredients_text::text
  FROM
    cosme_check.catalog c
    LEFT JOIN cosme_check.product_score_cap psc ON c.ean = psc.ean
  WHERE
    c.search_norm ILIKE ALL (ARRAY(SELECT '%' || t || '%' FROM UNNEST(STRING_TO_ARRAY(lower(p_query), ' ')) t WHERE t != ''))
    OR c.search_norm IS NULL
  ORDER BY
    c.score DESC NULLS LAST,
    c.count_total DESC NULLS LAST
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Also enhance browse RPC if it exists and returns similar structure
CREATE OR REPLACE FUNCTION cosme_check_browse_subcategory(
  p_category text,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  ean text,
  brand text,
  name text,
  category text,
  image_url text,
  source_url text,
  score numeric,
  score_label text,
  score_tone text,
  count_total bigint,
  count_orange bigint,
  count_rouge bigint,
  ingredients_text text
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.ean::text,
    c.brand::text,
    c.name::text,
    c.category::text,
    c.image_url::text,
    c.source_url::text,
    c.score::numeric,
    c.score_label::text,
    c.score_tone::text,
    c.count_total::bigint,
    COALESCE(psc.count_orange, 0)::bigint AS count_orange,
    COALESCE(psc.count_rouge, 0)::bigint AS count_rouge,
    c.ingredients_text::text
  FROM
    cosme_check.catalog c
    LEFT JOIN cosme_check.product_score_cap psc ON c.ean = psc.ean
  WHERE
    c.category = p_category
  ORDER BY
    c.score DESC NULLS LAST,
    c.count_total DESC NULLS LAST
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;
