-- Add paywall_shown flag to user_profiles
-- Tracks whether the user has seen the paywall after onboarding (true = skip or purchased)
ALTER TABLE cosme_check.user_profiles
ADD COLUMN paywall_shown BOOLEAN DEFAULT false;

-- Comment
COMMENT ON COLUMN cosme_check.user_profiles.paywall_shown IS 'Whether the user has completed the paywall flow (viewed/skipped/purchased)';
