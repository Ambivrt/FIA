-- Migration 016: Fix agent_knowledge unique index for upsert compatibility
--
-- The original COALESCE-based functional index cannot be targeted by
-- Supabase JS .upsert({ onConflict: "agent_slug,category,task_type,slug" })
-- because PostgreSQL ON CONFLICT requires plain column references, not expressions.
-- This replaces it with a plain unique index after making task_type NOT NULL DEFAULT ''.

-- 1. Backfill any NULLs
UPDATE agent_knowledge SET task_type = '' WHERE task_type IS NULL;

-- 2. Make column NOT NULL with default
ALTER TABLE agent_knowledge ALTER COLUMN task_type SET DEFAULT '';
ALTER TABLE agent_knowledge ALTER COLUMN task_type SET NOT NULL;

-- 3. Drop the functional index
DROP INDEX IF EXISTS idx_ak_agent_category_tasktype_slug;

-- 4. Create plain unique index (now usable by ON CONFLICT)
CREATE UNIQUE INDEX idx_ak_agent_category_tasktype_slug
  ON agent_knowledge (agent_slug, category, task_type, slug);
