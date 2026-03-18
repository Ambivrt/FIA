-- Bypass PostgREST PATCH for task status updates.
-- The .update().eq() path produces "ON CONFLICT" errors from an unknown
-- database-level source (trigger/rule/PostgREST config).  A plain SQL
-- UPDATE via .rpc() eliminates that layer.

CREATE OR REPLACE FUNCTION update_task_status(
  p_task_id uuid,
  p_status text,
  p_content_json jsonb DEFAULT NULL,
  p_model_used text DEFAULT NULL,
  p_tokens_used integer DEFAULT NULL,
  p_cost_sek numeric DEFAULT NULL,
  p_completed_at timestamptz DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  UPDATE public.tasks SET
    status        = p_status,
    content_json  = COALESCE(p_content_json, content_json),
    model_used    = COALESCE(p_model_used, model_used),
    tokens_used   = COALESCE(p_tokens_used, tokens_used),
    cost_sek      = COALESCE(p_cost_sek, cost_sek),
    completed_at  = COALESCE(p_completed_at, completed_at)
  WHERE id = p_task_id;
END;
$$;

-- Diagnostic: drop any rules on tasks that might rewrite UPDATE → INSERT ... ON CONFLICT
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT rulename FROM pg_rules WHERE tablename = 'tasks' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP RULE IF EXISTS %I ON public.tasks', r.rulename);
  END LOOP;
END;
$$;

-- Drop any remaining functions that reference ON CONFLICT
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT proname, pg_get_function_identity_arguments(oid) AS args
           FROM pg_proc
           WHERE prosrc LIKE '%ON CONFLICT%' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS public.%I(%s)', r.proname, r.args);
  END LOOP;
END;
$$;
