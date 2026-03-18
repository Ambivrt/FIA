-- Fix: Content Agent fails with "duplicate key value violates unique constraint
-- idx_cost_ledger_task_id_unique" when updating tasks.
--
-- Root cause: a trigger on the tasks table inserts into cost_ledger on every
-- UPDATE. The unique constraint on task_id means any task updated more than
-- once (revision cycles, status changes) fails.
--
-- Solution: drop ALL non-internal triggers on tasks (we don't use any),
-- drop any functions that reference cost_ledger, and drop the cost_ledger
-- table itself. Cost tracking lives in tasks.cost_sek + metrics table.

-- 1. Drop all non-internal triggers on tasks
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tgname FROM pg_trigger
    WHERE tgrelid = 'public.tasks'::regclass AND NOT tgisinternal
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.tasks', r.tgname);
  END LOOP;
END;
$$;

-- 2. Drop any function that references cost_ledger
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT proname, pg_get_function_identity_arguments(oid) AS args
    FROM pg_proc
    WHERE prosrc LIKE '%cost_ledger%' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS public.%I(%s)', r.proname, r.args);
  END LOOP;
END;
$$;

-- 3. Drop the cost_ledger table entirely (not part of managed schema)
DROP TABLE IF EXISTS cost_ledger;
