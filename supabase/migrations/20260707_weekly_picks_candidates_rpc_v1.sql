-- Candidats "Pepites de la semaine" : batch multi-needs, forme carte produit.
-- APPLIQUEE EN PROD le 7 juillet 2026 via MCP (migration weekly_picks_candidates_rpc_v1).
--
-- NB seuil : catalog.score est sur 0-20, or product_intent_mapping.min_score
-- contient des valeurs heritees sur une autre echelle (jusqu'a 50). On BORNE
-- le seuil effectif dans [0,20] (LEAST(min_score,15)) pour ne jamais renvoyer
-- 0 candidat. product_intent_mapping n'est PAS modifiee (l'advisor s'appuie
-- dessus) : sa curation (echelle min_score + patterns FR, aujourd'hui en
-- anglais alors que catalog.category est en francais) reste un chantier a part,
-- a traiter avant d'activer flag_weekly_picks en prod.

CREATE OR REPLACE FUNCTION public.cosme_check_weekly_picks_candidates(
  p_needs text[],
  p_per_need integer DEFAULT 12
)
RETURNS TABLE (
  need text, ean text, brand text, name text, image_url text,
  score integer, sub_category text, ingredients_text text,
  count_orange integer, count_rouge integer, count_total integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'cosme_check', 'public'
AS $function$
  SELECT
    n.need, c.ean::text, c.brand, c.name, c.image_url,
    COALESCE(c.score, 0)::int, pc.subcategory, c.ingredients_text,
    COALESCE(c.count_orange, 0)::int, COALESCE(c.count_rouge, 0)::int,
    COALESCE(c.count_total, 0)::int
  FROM unnest(p_needs) AS n(need)
  JOIN cosme_check.product_intent_mapping m ON m.need = n.need AND m.active
  CROSS JOIN LATERAL (
    SELECT cc.*
    FROM cosme_check.catalog cc
    WHERE cc.is_active = true
      AND cc.image_url IS NOT NULL
      AND cc.ingredients_text IS NOT NULL
      AND COALESCE(cc.score, 0) >= LEAST(GREATEST(m.min_score, 0), 15)
      AND EXISTS (
        SELECT 1 FROM unnest(m.category_patterns) AS pat
        WHERE cc.category ILIKE '%' || pat || '%'
      )
    ORDER BY COALESCE(cc.score, 0) DESC, COALESCE(cc.count_total, 0) DESC, cc.ean ASC
    LIMIT LEAST(GREATEST(COALESCE(p_per_need, 12), 1), 20)
  ) c
  LEFT JOIN cosme_check.product_classifications pc ON pc.ean = c.ean;
$function$;

REVOKE ALL ON FUNCTION public.cosme_check_weekly_picks_candidates(text[], integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cosme_check_weekly_picks_candidates(text[], integer) TO authenticated, service_role;
