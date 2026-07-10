-- FIX (9 juil 2026) : l'analyse produit sur le WEB (cosme-check.com/analyse,
-- barcode + collage + recherche) échouait avec « permission denied for function
-- cosme_check_match_inci_batch » (code 42501).
--
-- Cause : la route web `app/api/analyser/route.ts` appelle ces 2 RPC via le
-- client ANON (`supabaseAnon()`), mais le grant `anon` avait été retiré lors du
-- durcissement sécurité de juillet 2026 — alors que leurs RPC sœurs appelées de
-- la même façon (`cosme_check_get_inci_analysis`, `cosme_check_get_product_analysis`)
-- l'ont conservé. Ces 2 fonctions sont en LECTURE SEULE sur des données de
-- référence publiques (matching de tokens INCI + candidats trigram) : l'accès
-- anon est le comportement voulu du site public.
--
-- Reproduit + vérifié : appel anon REST -> 401/42501 AVANT, 200 + lignes APRÈS.
-- NE PAS re-révoquer ces 2 grants lors d'un futur passage de durcissement.

GRANT EXECUTE ON FUNCTION public.cosme_check_match_inci_batch(p_tokens text[]) TO anon;
GRANT EXECUTE ON FUNCTION public.cosme_check_top_trigram_candidates(p_token text, p_limit integer) TO anon;
