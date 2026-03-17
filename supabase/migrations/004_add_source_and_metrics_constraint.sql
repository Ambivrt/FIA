-- Fix 1: Add missing 'source' column to tasks table.
-- The gateway writes source='gateway' when creating tasks (base-agent.ts).
-- The task-listener filters on source != 'gateway' to avoid double-processing.
-- The column was referenced in code but never created via migration.

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS source text;

CREATE INDEX IF NOT EXISTS idx_tasks_source ON tasks(source);

-- Fix 2: Add unique constraint on metrics for safe upsert.
-- A database trigger on tasks uses INSERT ... ON CONFLICT to aggregate
-- metrics, but the target columns lacked a unique constraint, causing:
--   "there is no unique or exclusion constraint matching the ON CONFLICT specification"

ALTER TABLE metrics
  ADD CONSTRAINT metrics_unique_per_period
  UNIQUE (category, metric_name, period, period_start);
