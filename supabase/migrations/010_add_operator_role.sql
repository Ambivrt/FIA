-- Add 'operator' role to profiles
-- Operator: can approve/reject tasks and view costs, but cannot
-- change agent config, routing, tools, or manage users.

-- 1. Update CHECK constraint on profiles.role
ALTER TABLE profiles DROP CONSTRAINT profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('orchestrator', 'admin', 'viewer', 'operator'));

-- 2. Allow operator to insert approvals (approve/reject tasks)
DROP POLICY "approvals_insert" ON approvals;
CREATE POLICY "approvals_insert" ON approvals FOR INSERT
  WITH CHECK (public.get_user_role() IN ('orchestrator', 'admin', 'operator'));

-- Note: agents_update and tasks_update policies remain orchestrator+admin only.
-- Operator cannot pause/resume agents or change config/routing/tools.
