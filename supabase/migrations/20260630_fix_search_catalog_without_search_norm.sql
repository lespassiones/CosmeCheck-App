-- Fix cosme_check_search_catalog to work without search_norm column
-- Uses direct f_unaccent + ILIKE instead
-- (30 juin 2026)

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
    lower(f_unaccent(c.brand || ' ' || c.name)) ILIKE ALL (
      ARRAY(SELECT '%' || t || '%' FROM UNNEST(STRING_TO_ARRAY(lower(p_query), ' ')) t WHERE t != '')
    )
  ORDER BY
    c.score DESC NULLS LAST,
    c.count_total DESC NULLS LAST
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Also fix browse RPC
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
