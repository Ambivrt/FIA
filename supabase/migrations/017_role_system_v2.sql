-- FIA Role System v2
-- Replaces: admin, orchestrator, operator, viewer (+ nobody fallback)
-- With:     admin, orchestrator, reviewer, viewer, external
--
-- Key changes:
--   - operator → reviewer (rename)
--   - nobody → viewer (normalize)
--   - external role added (limited: published content + feedback only)
--   - RLS policies updated to restrict external users

-- ============================================================================
-- 1. DATA MIGRATION – rename operator → reviewer, nobody → viewer
-- ============================================================================

UPDATE profiles SET role = 'reviewer' WHERE role = 'operator';
UPDATE profiles SET role = 'viewer'   WHERE role = 'nobody';

-- ============================================================================
-- 2. UPDATE CHECK CONSTRAINT on profiles.role
-- ============================================================================

ALTER TABLE profiles DROP CONSTRAINT profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'orchestrator', 'reviewer', 'viewer', 'external'));

-- ============================================================================
-- 3. UPDATE approvals.reviewer_type CHECK to include reviewer + external
-- ============================================================================

ALTER TABLE approvals DROP CONSTRAINT approvals_reviewer_type_check;
ALTER TABLE approvals ADD CONSTRAINT approvals_reviewer_type_check
  CHECK (reviewer_type IN ('brand_agent', 'orchestrator', 'admin', 'reviewer', 'external', 'ledningsgrupp'));

-- ============================================================================
-- 4. UPDATE RLS POLICIES
-- ============================================================================

-- ---- APPROVALS INSERT: add reviewer (external cannot approve/reject) ----
DROP POLICY "approvals_insert" ON approvals;
CREATE POLICY "approvals_insert" ON approvals FOR INSERT
  WITH CHECK (public.get_user_role() IN ('orchestrator', 'admin', 'reviewer'));

-- ---- TASKS INSERT: add reviewer ----
DROP POLICY "tasks_insert" ON tasks;
CREATE POLICY "tasks_insert" ON tasks FOR INSERT
  WITH CHECK (public.get_user_role() IN ('orchestrator', 'admin', 'reviewer'));

-- ---- TASKS UPDATE: add reviewer (for approve/reject) ----
DROP POLICY "tasks_update" ON tasks;
CREATE POLICY "tasks_update" ON tasks FOR UPDATE
  USING (public.get_user_role() IN ('orchestrator', 'admin', 'reviewer'));

-- ---- TASKS SELECT: restrict external to published only ----
DROP POLICY "tasks_select" ON tasks;
CREATE POLICY "tasks_select" ON tasks FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (
      public.get_user_role() != 'external'
      OR status = 'published'
    )
  );

-- ---- AGENTS SELECT: exclude external ----
DROP POLICY "agents_select" ON agents;
CREATE POLICY "agents_select" ON agents FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND public.get_user_role() != 'external'
  );

-- ---- ACTIVITY LOG SELECT: exclude external ----
DROP POLICY "activity_log_select" ON activity_log;
CREATE POLICY "activity_log_select" ON activity_log FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND public.get_user_role() != 'external'
  );

-- ---- METRICS SELECT: exclude external ----
DROP POLICY "metrics_select" ON metrics;
CREATE POLICY "metrics_select" ON metrics FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND public.get_user_role() != 'external'
  );

-- ---- PROFILES SELECT: unchanged (all authenticated) ----
-- No change needed – external users need to read own profile

-- ---- AGENTS UPDATE: unchanged (orchestrator + admin) ----
-- No change needed

-- ============================================================================
-- 5. UPDATE TABLE COMMENT
-- ============================================================================

COMMENT ON TABLE profiles IS 'User profiles linked to Supabase Auth. Roles: admin (superuser), orchestrator (governance), reviewer (approve/create tasks), viewer (read-only), external (published content + feedback).';
