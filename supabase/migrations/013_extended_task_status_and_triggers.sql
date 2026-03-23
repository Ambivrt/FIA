-- 013_extended_task_status_and_triggers.sql
-- Extended task status model + trigger engine support
-- See: FIA Task Status & Trigger Engine Specification v1.0.0

-- 1. Extend task status constraint
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_status_check CHECK (
  status IN (
    'queued', 'in_progress', 'completed',
    'awaiting_review', 'approved', 'rejected', 'revision_requested',
    'delivered', 'activated', 'triggered', 'acknowledged',
    'live', 'paused_task', 'ended',
    'published',  -- deprecated, kept for backward compatibility
    'error'
  )
);

-- 2. Add parent_task_id for downstream task relations
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS parent_task_id uuid REFERENCES tasks(id);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS trigger_source text;

-- 3. Index for parent lookups
CREATE INDEX IF NOT EXISTS idx_tasks_parent_task_id ON tasks(parent_task_id)
  WHERE parent_task_id IS NOT NULL;

-- 4. Index for status filtering (dashboard queries)
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

-- 5. Pending triggers table
CREATE TABLE IF NOT EXISTS pending_triggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_task_id uuid NOT NULL REFERENCES tasks(id),
  trigger_name text NOT NULL,
  target_agent_slug text NOT NULL,
  target_task_type text NOT NULL,
  priority text NOT NULL DEFAULT 'normal',
  context_json jsonb DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending',  -- pending | approved | rejected | executed
  decided_by uuid REFERENCES profiles(id),
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 6. RLS for pending_triggers
ALTER TABLE pending_triggers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_triggers" ON pending_triggers
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "insert_triggers" ON pending_triggers
  FOR INSERT WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('orchestrator', 'admin')
  );

CREATE POLICY "update_triggers" ON pending_triggers
  FOR UPDATE USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('orchestrator', 'admin')
  );

-- 7. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE pending_triggers;
