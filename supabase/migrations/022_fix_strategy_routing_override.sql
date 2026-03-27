-- Migration 022: Remove "routing" from Strategy Agent's _admin_overrides
-- This restores routing to agent.yaml defaults (strategic_research → google-search)
-- instead of the dashboard-set Gemini routing that causes 401 errors.

UPDATE agents
SET config_json = config_json
  -- Remove "routing" from _admin_overrides array
  #- '{_admin_overrides}'
  || CASE
    WHEN jsonb_array_length(
      COALESCE(config_json->'_admin_overrides', '[]'::jsonb) - 'routing'
    ) > 0
    THEN jsonb_build_object('_admin_overrides', COALESCE(config_json->'_admin_overrides', '[]'::jsonb) - 'routing')
    ELSE '{}'::jsonb
  END
WHERE slug = 'strategy'
  AND config_json->'_admin_overrides' @> '"routing"';
