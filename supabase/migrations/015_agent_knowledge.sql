-- Migration 015: agent_knowledge table
-- Stores all agent knowledge items (skills, system_context, task_context, few_shot, memory)
-- Source of truth for runtime prompts; seeded from YAML at gateway startup.

CREATE TABLE agent_knowledge (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_slug  text NOT NULL,
  category    text NOT NULL CHECK (category IN ('skill', 'system_context', 'task_context', 'few_shot', 'memory')),
  task_type   text,                                    -- used for task_context and few_shot filtering
  slug        text NOT NULL,                           -- unique key within agent+category+task_type
  title       text NOT NULL,
  description text DEFAULT '',
  body        text NOT NULL DEFAULT '',
  metadata    jsonb DEFAULT '{}',
  sort_order  int NOT NULL DEFAULT 0,
  enabled     boolean NOT NULL DEFAULT true,
  source      text NOT NULL DEFAULT 'yaml',            -- 'yaml' | 'dashboard' | 'agent'
  version     int NOT NULL DEFAULT 1,
  created_by  uuid REFERENCES auth.users(id),
  updated_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Unique constraint: one entry per agent + category + task_type + slug
CREATE UNIQUE INDEX idx_ak_agent_category_tasktype_slug
  ON agent_knowledge (agent_slug, category, COALESCE(task_type, ''), slug);

-- Fast lookups by agent
CREATE INDEX idx_ak_agent_slug ON agent_knowledge (agent_slug);

-- Category filter
CREATE INDEX idx_ak_category ON agent_knowledge (category);

-- Composite: agent + category (common query pattern)
CREATE INDEX idx_ak_agent_category ON agent_knowledge (agent_slug, category);

-- Partial index for enabled items only
CREATE INDEX idx_ak_enabled ON agent_knowledge (agent_slug, category)
  WHERE enabled = true;

-- RLS
ALTER TABLE agent_knowledge ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read agent_knowledge"
  ON agent_knowledge FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admin can modify agent_knowledge"
  ON agent_knowledge FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Orchestrator can update agent_knowledge"
  ON agent_knowledge FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'orchestrator'
    )
  );

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE agent_knowledge;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_agent_knowledge_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_agent_knowledge_updated_at
  BEFORE UPDATE ON agent_knowledge
  FOR EACH ROW EXECUTE FUNCTION update_agent_knowledge_updated_at();
