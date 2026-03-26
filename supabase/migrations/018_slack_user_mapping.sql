-- FIA 0.5.6 – Slack User Mapping
-- Adds slack_user_id to profiles for Slack → FIA role resolution.
-- Enables permission-based Slack commands.

-- ============================================================================
-- 1. ADD slack_user_id COLUMN
-- ============================================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS slack_user_id text;

-- Unique constraint — one Slack user per FIA profile
ALTER TABLE profiles ADD CONSTRAINT profiles_slack_user_id_unique UNIQUE (slack_user_id);

-- Index for fast lookups by slack_user_id
CREATE INDEX IF NOT EXISTS idx_profiles_slack_user_id ON profiles (slack_user_id) WHERE slack_user_id IS NOT NULL;

-- ============================================================================
-- 2. UPDATE TABLE COMMENT
-- ============================================================================

COMMENT ON TABLE profiles IS 'User profiles linked to Supabase Auth. Roles: admin, orchestrator, reviewer, viewer, external. Optional slack_user_id for Slack command authorization.';
