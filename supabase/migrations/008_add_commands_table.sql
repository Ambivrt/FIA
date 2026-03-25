-- Migration 008: Add commands table for Dashboard → Gateway communication
-- Commands table enables audit trail and structured command flow.

CREATE TABLE commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  command_type text NOT NULL,
  target_slug text,
  payload_json jsonb DEFAULT '{}'::jsonb,
  issued_by uuid NOT NULL REFERENCES profiles(id),
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

-- Index for Gateway polling/listening (pending commands)
CREATE INDEX idx_commands_status ON commands (status) WHERE status = 'pending';

-- RLS
ALTER TABLE commands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "insert_commands" ON commands FOR INSERT WITH CHECK (
  (SELECT role FROM profiles WHERE id = auth.uid()) IN ('orchestrator', 'admin')
);

CREATE POLICY "select_commands" ON commands FOR SELECT USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) IN ('orchestrator', 'admin')
);

-- Gateway updates command status via service role key (no UPDATE policy needed for RLS)

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE commands;
