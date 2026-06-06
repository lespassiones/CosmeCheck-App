-- ============================================================================
-- Migration : cosme_check_register_scanned_barcode
-- Objet     : enregistrer un code-barres inconnu dans le catalogue en mode
--             "à compléter" (sans INCI). Permet de tracer les EAN scannés
--             par les utilisateurs avant que la base soit enrichie.
--
-- Comportement :
--   - INSERT avec name = ean (stub) pour satisfaire la contrainte NOT NULL.
--   - ON CONFLICT (ean) DO NOTHING → idempotent, un 2e scan ne réécrit rien.
--   - INCI null → produit masqué (searchCatalogByName filtre ingredients_text
--     < 5 chars), ne remonte jamais dans les résultats de recherche.
--
-- Consommateur : Edge Function `product-by-barcode` (étape finale, quand
--   le catalog ne contient pas l'EAN scanné).
--
-- Sécurité : SECURITY DEFINER, appelé depuis l'Edge Function avec la
--   service-role key (bypass RLS). Grant anon/authenticated pour cohérence.
--
-- Idempotente : CREATE OR REPLACE FUNCTION.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cosme_check_register_scanned_barcode(
  p_ean text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cosme_check
AS $$
BEGIN
  INSERT INTO cosme_check.catalog (ean, name)
  VALUES (p_ean, p_ean)
  ON CONFLICT (ean) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cosme_check_register_scanned_barcode(text) TO authenticated, anon;

COMMENT ON FUNCTION public.cosme_check_register_scanned_barcode(text)
  IS 'Enregistre un code-barres scanné mais inconnu dans le catalogue (stub sans INCI). Idempotent. Utilisé par l''Edge Function product-by-barcode.';
