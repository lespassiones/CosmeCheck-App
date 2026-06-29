-- ============================================================================
-- Migration: refactor_credits_system
-- Objet: Refactoriser le système de crédits pour supporter des périodes modulables
--        (daily, weekly, monthly, yearly, one_time)
--
-- Tables créées/modifiées:
--   - credit_tiers: config par tier (free/premium) avec périodes variables
--   - user_credits_override: overrides individuels par utilisateur
--   - user_credits: table existante, ajout de colonnes de tracking
--
-- RPCs créées/modifiées:
--   - cosme_check_get_credits: retourne crédits + renewal_period
--   - cosme_check_admin_get_credit_tiers: pour l'interface admin
--   - cosme_check_admin_update_credit_tier: mise à jour admin
--   - cosme_check_admin_get_user_overrides: liste des overrides
--   - cosme_check_admin_set_user_override: créer/modifier override
--
-- Déploiement: MCP apply_migration
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────
-- 1. CRÉER TABLE credit_tiers (configuration par tier)
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cosme_check.credit_tiers (
  tier VARCHAR(50) PRIMARY KEY,  -- 'free', 'premium'
  credit_amount INT NOT NULL DEFAULT 5,
  renewal_period VARCHAR(50) NOT NULL DEFAULT 'daily',  -- 'one_time', 'daily', 'weekly', 'monthly', 'yearly'
  renewal_interval_days INT,  -- auto-calculé: 1 (daily), 7 (weekly), 30 (monthly), 365 (yearly), NULL (one_time)
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Ajouter comment
COMMENT ON TABLE cosme_check.credit_tiers IS 'Configuration des crédits par tier (free/premium)';
COMMENT ON COLUMN cosme_check.credit_tiers.renewal_period IS 'Période de renouvellement: one_time, daily, weekly, monthly, yearly';
COMMENT ON COLUMN cosme_check.credit_tiers.renewal_interval_days IS 'Intervalle en jours (auto-calculé à partir de renewal_period)';

-- Insérer les defaults (si la table était vide)
INSERT INTO cosme_check.credit_tiers (tier, credit_amount, renewal_period, renewal_interval_days)
VALUES
  ('free', 5, 'daily', 1),
  ('premium', 100, 'monthly', 30)
ON CONFLICT (tier) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────
-- 2. CRÉER TABLE user_credits_override (exceptions par utilisateur)
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cosme_check.user_credits_override (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credit_amount INT NOT NULL,
  renewal_period VARCHAR(50) NOT NULL,
  renewal_interval_days INT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id)  -- Un seul override par user
);

COMMENT ON TABLE cosme_check.user_credits_override IS 'Surcharges de crédits par utilisateur (exceptions)';
COMMENT ON COLUMN cosme_check.user_credits_override.active IS 'Si false, l''override ne s''applique pas (mais reste en DB pour audit)';

CREATE INDEX IF NOT EXISTS idx_user_credits_override_user_id ON cosme_check.user_credits_override(user_id);
CREATE INDEX IF NOT EXISTS idx_user_credits_override_active ON cosme_check.user_credits_override(active);

-- ──────────────────────────────────────────────────────────────────────────
-- 3. MODIFIER user_credits (table existante) - ajouter colonnes tracking
-- ──────────────────────────────────────────────────────────────────────────
-- Ajouter colonnes si elles n'existent pas
ALTER TABLE cosme_check.user_credits
  ADD COLUMN IF NOT EXISTS renewal_period VARCHAR(50) DEFAULT 'daily',
  ADD COLUMN IF NOT EXISTS renewal_interval_days INT,
  ADD COLUMN IF NOT EXISTS last_renewal_at TIMESTAMP WITH TIME ZONE DEFAULT now();

-- ──────────────────────────────────────────────────────────────────────────
-- 4. RPC: cosme_check_admin_get_credit_tiers
-- ──────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS cosme_check.cosme_check_admin_get_credit_tiers() CASCADE;

CREATE FUNCTION cosme_check.cosme_check_admin_get_credit_tiers()
RETURNS TABLE (
  tier VARCHAR,
  credit_amount INT,
  renewal_period VARCHAR,
  renewal_interval_days INT
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    ct.tier,
    ct.credit_amount,
    ct.renewal_period,
    ct.renewal_interval_days
  FROM cosme_check.credit_tiers ct
  ORDER BY ct.tier;
END;
$$;

GRANT EXECUTE ON FUNCTION cosme_check.cosme_check_admin_get_credit_tiers() TO authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- 5. RPC: cosme_check_admin_update_credit_tier
-- ──────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS cosme_check.cosme_check_admin_update_credit_tier(VARCHAR, INT, VARCHAR, INT) CASCADE;

CREATE FUNCTION cosme_check.cosme_check_admin_update_credit_tier(
  p_tier VARCHAR,
  p_credit_amount INT,
  p_renewal_period VARCHAR,
  p_renewal_interval_days INT DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_interval_days INT;
BEGIN
  -- Valider la période
  IF p_renewal_period NOT IN ('one_time', 'daily', 'weekly', 'monthly', 'yearly') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid renewal_period');
  END IF;

  -- Calculer l''intervalle automatiquement
  v_interval_days := CASE
    WHEN p_renewal_period = 'daily' THEN 1
    WHEN p_renewal_period = 'weekly' THEN 7
    WHEN p_renewal_period = 'monthly' THEN 30
    WHEN p_renewal_period = 'yearly' THEN 365
    ELSE NULL
  END;

  -- Mettre à jour ou insérer
  INSERT INTO cosme_check.credit_tiers (tier, credit_amount, renewal_period, renewal_interval_days, updated_at)
  VALUES (p_tier, p_credit_amount, p_renewal_period, v_interval_days, now())
  ON CONFLICT (tier) DO UPDATE SET
    credit_amount = p_credit_amount,
    renewal_period = p_renewal_period,
    renewal_interval_days = v_interval_days,
    updated_at = now();

  RETURN jsonb_build_object(
    'ok', true,
    'tier', p_tier,
    'credit_amount', p_credit_amount,
    'renewal_period', p_renewal_period,
    'renewal_interval_days', v_interval_days
  );
END;
$$;

GRANT EXECUTE ON FUNCTION cosme_check.cosme_check_admin_update_credit_tier(VARCHAR, INT, VARCHAR, INT) TO authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- 6. RPC: cosme_check_admin_get_user_overrides
-- ──────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS cosme_check.cosme_check_admin_get_user_overrides() CASCADE;

CREATE FUNCTION cosme_check.cosme_check_admin_get_user_overrides()
RETURNS TABLE (
  user_id UUID,
  credit_amount INT,
  renewal_period VARCHAR,
  renewal_interval_days INT,
  active BOOLEAN,
  created_at TIMESTAMP WITH TIME ZONE
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    uoc.user_id,
    uoc.credit_amount,
    uoc.renewal_period,
    uoc.renewal_interval_days,
    uoc.active,
    uoc.created_at
  FROM cosme_check.user_credits_override uoc
  ORDER BY uoc.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION cosme_check.cosme_check_admin_get_user_overrides() TO authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- 7. RPC: cosme_check_admin_set_user_override
-- ──────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS cosme_check.cosme_check_admin_set_user_override(UUID, INT, VARCHAR, INT, BOOLEAN) CASCADE;

CREATE FUNCTION cosme_check.cosme_check_admin_set_user_override(
  p_user_id UUID,
  p_credit_amount INT,
  p_renewal_period VARCHAR,
  p_renewal_interval_days INT DEFAULT NULL,
  p_active BOOLEAN DEFAULT true
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_interval_days INT;
BEGIN
  -- Valider la période
  IF p_renewal_period NOT IN ('one_time', 'daily', 'weekly', 'monthly', 'yearly') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid renewal_period');
  END IF;

  -- Calculer l''intervalle automatiquement
  v_interval_days := CASE
    WHEN p_renewal_period = 'daily' THEN 1
    WHEN p_renewal_period = 'weekly' THEN 7
    WHEN p_renewal_period = 'monthly' THEN 30
    WHEN p_renewal_period = 'yearly' THEN 365
    ELSE NULL
  END;

  -- Insérer ou mettre à jour l''override
  INSERT INTO cosme_check.user_credits_override (user_id, credit_amount, renewal_period, renewal_interval_days, active, updated_at)
  VALUES (p_user_id, p_credit_amount, p_renewal_period, v_interval_days, p_active, now())
  ON CONFLICT (user_id) DO UPDATE SET
    credit_amount = p_credit_amount,
    renewal_period = p_renewal_period,
    renewal_interval_days = v_interval_days,
    active = p_active,
    updated_at = now();

  RETURN jsonb_build_object(
    'ok', true,
    'user_id', p_user_id,
    'credit_amount', p_credit_amount,
    'renewal_period', p_renewal_period,
    'renewal_interval_days', v_interval_days,
    'active', p_active
  );
END;
$$;

GRANT EXECUTE ON FUNCTION cosme_check.cosme_check_admin_set_user_override(UUID, INT, VARCHAR, INT, BOOLEAN) TO authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- 8. RPC: cosme_check_admin_get_user_credits_config
-- ──────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS cosme_check.cosme_check_admin_get_user_credits_config(UUID) CASCADE;

CREATE FUNCTION cosme_check.cosme_check_admin_get_user_credits_config(p_user_id UUID)
RETURNS TABLE (
  tier VARCHAR,
  credit_amount INT,
  renewal_period VARCHAR,
  renewal_interval_days INT,
  has_override BOOLEAN,
  override_active BOOLEAN
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_tier VARCHAR;
  v_has_override BOOLEAN;
  v_override_active BOOLEAN;
BEGIN
  -- Récupérer le tier de l''utilisateur
  SELECT up.tier INTO v_tier
  FROM cosme_check.user_profiles up
  WHERE up.id = p_user_id;

  -- Vérifier s''il existe un override
  SELECT active INTO v_override_active
  FROM cosme_check.user_credits_override uoc
  WHERE uoc.user_id = p_user_id;

  v_has_override := v_override_active IS NOT NULL;

  -- Si override actif, retourner les données de l''override
  IF v_override_active = true THEN
    RETURN QUERY
    SELECT
      NULL::VARCHAR,
      uoc.credit_amount,
      uoc.renewal_period,
      uoc.renewal_interval_days,
      true,
      true
    FROM cosme_check.user_credits_override uoc
    WHERE uoc.user_id = p_user_id AND uoc.active = true;
  ELSE
    -- Sinon retourner la config du tier
    RETURN QUERY
    SELECT
      ct.tier,
      ct.credit_amount,
      ct.renewal_period,
      ct.renewal_interval_days,
      v_has_override,
      false
    FROM cosme_check.credit_tiers ct
    WHERE ct.tier = v_tier;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION cosme_check.cosme_check_admin_get_user_credits_config(UUID) TO authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- 8. RPC: cosme_check_get_credits (REWRITE avec support renewal_period)
-- ──────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS cosme_check.cosme_check_get_credits() CASCADE;

CREATE FUNCTION cosme_check.cosme_check_get_credits()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id UUID;
  v_used INT;
  v_limit INT;
  v_remaining INT;
  v_renewal_period VARCHAR;
  v_renewal_interval_days INT;
  v_today DATE;
  v_override_active BOOLEAN;
BEGIN
  -- Récupérer l''ID de l''utilisateur actuel
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  v_today := CURRENT_DATE;

  -- Vérifier s''il existe un override actif
  SELECT uoc.active
  INTO v_override_active
  FROM cosme_check.user_credits_override uoc
  WHERE uoc.user_id = v_user_id;

  -- Si override actif, utiliser les valeurs de l''override
  IF v_override_active = true THEN
    SELECT uoc.credit_amount, uoc.renewal_period, uoc.renewal_interval_days
    INTO v_limit, v_renewal_period, v_renewal_interval_days
    FROM cosme_check.user_credits_override uoc
    WHERE uoc.user_id = v_user_id AND uoc.active = true;
  ELSE
    -- Sinon, utiliser le tier de l''utilisateur
    SELECT ct.credit_amount, ct.renewal_period, ct.renewal_interval_days
    INTO v_limit, v_renewal_period, v_renewal_interval_days
    FROM cosme_check.credit_tiers ct
    JOIN cosme_check.user_profiles up ON up.tier = ct.tier
    WHERE up.id = v_user_id;
  END IF;

  -- Récupérer les crédits utilisés aujourd''hui (ou dernière journée de renouvellement)
  SELECT COALESCE(uc.used, 0)
  INTO v_used
  FROM cosme_check.user_credits uc
  WHERE uc.user_id = v_user_id AND uc.day = v_today;

  -- Si aucune ligne trouvée, c''est 0
  IF NOT FOUND THEN
    v_used := 0;
  END IF;

  -- Calculer les crédits restants
  v_remaining := GREATEST(0, v_limit - v_used);

  RETURN jsonb_build_object(
    'ok', true,
    'used', v_used,
    'limit', v_limit,
    'remaining', v_remaining,
    'renewal_period', v_renewal_period,
    'renewal_interval_days', v_renewal_interval_days
  );
END;
$$;

GRANT EXECUTE ON FUNCTION cosme_check.cosme_check_get_credits() TO authenticated, anon;

-- ──────────────────────────────────────────────────────────────────────────
-- 9. RLS et GRANT
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE cosme_check.credit_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE cosme_check.user_credits_override ENABLE ROW LEVEL SECURITY;

-- Policies pour credit_tiers (lecture seule pour tous)
CREATE POLICY "credit_tiers_select_all" ON cosme_check.credit_tiers
  FOR SELECT TO public, authenticated, anon
  USING (true);

CREATE POLICY "credit_tiers_admin_write" ON cosme_check.credit_tiers
  FOR ALL TO public, authenticated, anon
  USING (false)
  WITH CHECK (false);

-- Policies pour user_credits_override
CREATE POLICY "user_credits_override_select_own" ON cosme_check.user_credits_override
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "user_credits_override_admin_all" ON cosme_check.user_credits_override
  FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);

-- Grant
GRANT SELECT ON cosme_check.credit_tiers TO authenticated, anon;
GRANT SELECT ON cosme_check.user_credits_override TO authenticated, anon;

-- ──────────────────────────────────────────────────────────────────────────
-- 10. Indices de performance
-- ──────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_user_credits_override_user_active ON cosme_check.user_credits_override(user_id, active);
CREATE INDEX IF NOT EXISTS idx_credit_tiers_tier ON cosme_check.credit_tiers(tier);
