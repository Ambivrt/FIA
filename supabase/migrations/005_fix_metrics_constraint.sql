-- Fix: Content Agent fails with "there is no unique or exclusion constraint
-- matching the ON CONFLICT specification" when updating tasks.
--
-- Root cause: a trigger on the tasks table attempts INSERT ... ON CONFLICT
-- into the metrics table. The unique constraint either doesn't match the
-- trigger's columns or the trigger is referencing a stale schema.
--
-- Solution: drop the constraint and any rogue trigger. Multiple cost metric
-- rows per day (one per task execution) is the intended pattern —
-- aggregation happens at read time (SUM/AVG in queries).

-- 1. Drop unique constraint that prevents per-task cost metric inserts
ALTER TABLE metrics DROP CONSTRAINT IF EXISTS metrics_unique_per_period;

-- 2. Drop any trigger on tasks that attempts ON CONFLICT into metrics
DROP TRIGGER IF EXISTS on_task_update_metrics ON tasks;
DROP FUNCTION IF EXISTS aggregate_task_metrics();
