-- Cleanup 41 unused indexes (audit 29 juin 2026)
-- Impact: +5-10% perf mutations, libère RAM/CPU

-- Ingredients table
DROP INDEX IF EXISTS cosme_check.ingredients_search_idx CASCADE;
DROP INDEX IF EXISTS cosme_check.ingredients_name_trgm_idx CASCADE;
DROP INDEX IF EXISTS cosme_check.ingredients_color_idx CASCADE;
DROP INDEX IF EXISTS cosme_check.ingredients_cas_idx CASCADE;
DROP INDEX IF EXISTS cosme_check.ingredients_details_scraped_idx CASCADE;

-- Categories table
DROP INDEX IF EXISTS cosme_check.idx_categories_parent_slug CASCADE;
DROP INDEX IF EXISTS cosme_check.idx_categories_level CASCADE;

-- Catalog table
DROP INDEX IF EXISTS cosme_check.catalog_category_trgm CASCADE;
DROP INDEX IF EXISTS cosme_check.catalog_category_leaf_trgm CASCADE;

-- Catalog ingredient index
DROP INDEX IF EXISTS cosme_check.catalog_ing_index_token_score CASCADE;

-- Product classifications
DROP INDEX IF EXISTS cosme_check.idx_product_classifications_category CASCADE;
DROP INDEX IF EXISTS cosme_check.pclassif_subcat_score_idx CASCADE;
DROP INDEX IF EXISTS cosme_check.pclassif_catslug_score_idx CASCADE;

-- Routine items
DROP INDEX IF EXISTS cosme_check.idx_routine_items_user CASCADE;
DROP INDEX IF EXISTS cosme_check.routine_items_analysis_id_idx CASCADE;

-- AI logs
DROP INDEX IF EXISTS cosme_check.ai_logs_user_feature_date_idx CASCADE;
DROP INDEX IF EXISTS cosme_check.ai_logs_user_id_idx CASCADE;

-- Ingredient aliases
DROP INDEX IF EXISTS cosme_check.ingredient_aliases_inci_id_idx CASCADE;

-- User feedback
DROP INDEX IF EXISTS cosme_check.user_feedback_created_at_idx CASCADE;
DROP INDEX IF EXISTS cosme_check.user_feedback_kind_idx CASCADE;

-- Product INCI cache
DROP INDEX IF EXISTS cosme_check.product_inci_cache_brand_name_trgm CASCADE;

-- Catalog category word
DROP INDEX IF EXISTS cosme_check.catalog_category_word_word_penal_score CASCADE;

-- Analyses
DROP INDEX IF EXISTS cosme_check.analyses_user_favori_idx CASCADE;

-- Catalog photo submissions
DROP INDEX IF EXISTS cosme_check.catalog_photo_submissions_status_created_idx CASCADE;

-- Advisor conversations
DROP INDEX IF EXISTS cosme_check.advisor_conversations_user_updated_idx CASCADE;

-- Advisor messages
DROP INDEX IF EXISTS cosme_check.advisor_messages_conv_created_idx CASCADE;

-- Web products
DROP INDEX IF EXISTS cosme_check.web_products_status_category_idx CASCADE;
DROP INDEX IF EXISTS cosme_check.web_products_updated_idx CASCADE;

-- Category counts cache
DROP INDEX IF EXISTS cosme_check.category_counts_cache_cat_idx CASCADE;

-- Ingredient families
DROP INDEX IF EXISTS cosme_check.ingredient_families_tag_slug_idx CASCADE;

-- Admin audit log
DROP INDEX IF EXISTS cosme_check.admin_audit_log_created_at_idx CASCADE;

-- Products table (legacy indexes)
DROP INDEX IF EXISTS cosme_check.products_brand_idx CASCADE;
DROP INDEX IF EXISTS cosme_check.products_score_idx CASCADE;

-- Public schema (old searches/transcriptions - outside cosme_check)
DROP INDEX IF EXISTS public.idx_searches_user_id CASCADE;
DROP INDEX IF EXISTS public.idx_transcriptions_user_id CASCADE;
