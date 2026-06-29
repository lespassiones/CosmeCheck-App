-- ============================================================================
-- Migration: create_product_intent_mapping
-- Objet: Créer la table product_intent_mapping pour mapper les besoins/zones/
--        concerns utilisateur vers les catégories de produits pertinentes.
--
-- Tables créées:
--   - product_intent_mapping: intent → category_patterns, zones, etc.
--   - product_scoring_rules: règles de scoring pour le recommender
--
-- Déploiement: MCP apply_migration
-- ============================================================================

-- 1. Table product_intent_mapping
CREATE TABLE IF NOT EXISTS cosme_check.product_intent_mapping (
  id BIGSERIAL PRIMARY KEY,
  need TEXT NOT NULL UNIQUE,  -- e.g., 'odor_control', 'hydration', 'anti_aging'
  body_zone TEXT,             -- e.g., 'feet', 'face', 'hair', 'hands'
  concern TEXT,               -- e.g., 'dryness', 'sensitivity', 'aging'
  category_patterns TEXT[],   -- e.g., '{deodorant,spray}', '{moisturizer,serum}'
  ingredient_hints TEXT[],    -- e.g., '{argan,shea butter}' pour hydration
  min_score INT DEFAULT 40,   -- score minimum pour un match
  weight DECIMAL(4,2) DEFAULT 1.0,
  active BOOLEAN DEFAULT true,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 2. Table product_scoring_rules
CREATE TABLE IF NOT EXISTS cosme_check.product_scoring_rules (
  id BIGSERIAL PRIMARY KEY,
  rule_name TEXT NOT NULL,
  rule_type TEXT NOT NULL,    -- 'ingredient_bonus', 'zone_bonus', 'restriction_penalty', 'routine_bonus'
  weight DECIMAL(8,2) DEFAULT 0,
  condition_data JSONB,       -- JSON pour stocker conditions complexes
  active BOOLEAN DEFAULT true,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 3. Insert des mappings de test
INSERT INTO cosme_check.product_intent_mapping (need, body_zone, concern, category_patterns, ingredient_hints, min_score, weight)
VALUES
  ('odor_control_feet', 'feet', 'odor', '{spray, powder, foot_deodorant}', '{zinc, baking_soda, activated_charcoal}', 35, 1.5),
  ('hydration_face', 'face', 'dryness', '{moisturizer, serum, cream}', '{hyaluronic_acid, glycerin, argan}', 40, 1.4),
  ('anti_aging', 'face', 'aging', '{retinol, serum, cream, mask}', '{retinol, peptides, vitamin_c}', 50, 1.8),
  ('sensitivity_face', 'face', 'sensitivity', '{moisturizer, cleanser, serum}', '{chamomile, centella_asiatica, oatmeal}', 40, 1.3),
  ('shampoo_dry_hair', 'hair', 'dryness', '{shampoo, conditioner}', '{argan, shea_butter, coconut_oil}', 35, 1.2),
  ('hand_care', 'hands', 'dryness', '{cream, hand_serum, lotion}', '{almond_oil, shea_butter, glycerin}', 40, 1.0),
  ('acne_prone', 'face', 'acne', '{cleanser, serum, mask}', '{salicylic_acid, niacinamide, tea_tree}', 45, 1.6),
  ('sun_protection', 'face', 'sun_damage', '{sunscreen, sun_cream, spf}', '{zinc_oxide, titanium_dioxide, vitamin_e}', 50, 1.7),
  ('lip_care', 'lips', 'dryness', '{lip_balm, lip_cream, lip_serum}', '{beeswax, cocoa_butter, vitamin_e}', 30, 0.9),
  ('eye_care', 'eyes', 'aging', '{eye_cream, eye_serum, eye_mask}', '{caffeine, retinol, hyaluronic_acid}', 45, 1.3),
  ('scalp_health', 'scalp', 'irritation', '{shampoo, scalp_treatment, toner}', '{zinc, salicylic_acid, tea_tree}', 40, 1.2),
  ('body_hydration', 'body', 'dryness', '{body_lotion, body_cream, body_oil}', '{shea_butter, almond_oil, jojoba}', 35, 1.1),
  ('anti_cellulite', 'legs', 'cellulite', '{cream, serum, oil}', '{caffeine, centella_asiatica, retinol}', 40, 1.4),
  ('brightening', 'face', 'dullness', '{serum, mask, cream}', '{vitamin_c, niacinamide, hyaluronic_acid}', 45, 1.5),
  ('calming_sensitive', 'face', 'inflammation', '{cream, serum, mask}', '{centella_asiatica, aloe, chamomile}', 40, 1.3)
ON CONFLICT (need) DO NOTHING;

-- 4. Insert des scoring rules
INSERT INTO cosme_check.product_scoring_rules (rule_name, rule_type, weight, condition_data, active)
VALUES
  ('ingredient_bonus_primary', 'ingredient_bonus', 30, '{"matching_ingredient_count": 1}', true),
  ('ingredient_bonus_secondary', 'ingredient_bonus', 15, '{"matching_ingredient_count": 2}', true),
  ('zone_bonus_exact', 'zone_bonus', 20, '{"zone_match": "exact"}', true),
  ('zone_bonus_related', 'zone_bonus', 10, '{"zone_match": "related"}', true),
  ('restriction_penalty', 'restriction_penalty', -500, '{"blocked_ingredient": true}', true),
  ('routine_bonus', 'routine_bonus', 15, '{"already_in_routine": true}', true),
  ('score_floor_bonus', 'ingredient_bonus', 5, '{"score_above_min": true}', true)
ON CONFLICT (rule_name) DO NOTHING;

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_product_intent_mapping_need ON cosme_check.product_intent_mapping(need);
CREATE INDEX IF NOT EXISTS idx_product_intent_mapping_zone ON cosme_check.product_intent_mapping(body_zone);
CREATE INDEX IF NOT EXISTS idx_product_intent_mapping_active ON cosme_check.product_intent_mapping(active);
CREATE INDEX IF NOT EXISTS idx_product_scoring_rules_type ON cosme_check.product_scoring_rules(rule_type);

-- 6. RLS (read-only for authenticated users, admin can modify)
ALTER TABLE cosme_check.product_intent_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE cosme_check.product_scoring_rules ENABLE ROW LEVEL SECURITY;

-- Allow authenticated to read, anon to read (catalog data)
CREATE POLICY "product_intent_mapping_select_all" ON cosme_check.product_intent_mapping
  FOR SELECT TO public, authenticated, anon
  USING (true);

CREATE POLICY "product_intent_mapping_admin_write" ON cosme_check.product_intent_mapping
  FOR ALL TO public, authenticated, anon
  USING (false)  -- Only admin can modify
  WITH CHECK (false);

CREATE POLICY "product_scoring_rules_select_all" ON cosme_check.product_scoring_rules
  FOR SELECT TO public, authenticated, anon
  USING (true);

CREATE POLICY "product_scoring_rules_admin_write" ON cosme_check.product_scoring_rules
  FOR ALL TO public, authenticated, anon
  USING (false)
  WITH CHECK (false);

-- Grant access to authenticated role
GRANT SELECT ON cosme_check.product_intent_mapping TO authenticated, anon;
GRANT SELECT ON cosme_check.product_scoring_rules TO authenticated, anon;
