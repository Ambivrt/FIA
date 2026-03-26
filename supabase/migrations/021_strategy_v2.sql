-- Strategy Agent v2.0.0 upgrade
-- Adds new scheduled jobs and updates agent config for expanded task types,
-- triggers, and escalation rules.

-- ============================================================================
-- 1. Add quarterly planning scheduled job (first Monday of each quarter)
-- ============================================================================
INSERT INTO scheduled_jobs (agent_id, cron_expression, task_type, title, priority, description, enabled)
SELECT
  a.id,
  '0 9 1-7 1,4,7,10 1',
  'quarterly_plan',
  'Kvartalsplanering',
  'high',
  'Automatisk kvartalsplanering vid Q-start (första måndagen i jan, apr, jul, okt)',
  true
FROM agents a
WHERE a.slug = 'strategy'
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 2. Add channel strategy review (bi-monthly, second Monday)
-- ============================================================================
INSERT INTO scheduled_jobs (agent_id, cron_expression, task_type, title, priority, description, enabled)
SELECT
  a.id,
  '0 10 8-14 * 1',
  'channel_strategy',
  'Kanalstrategigenomgång',
  'normal',
  'Varannan vecka: genomgång och uppdatering av kanalstrategier',
  false
FROM agents a
WHERE a.slug = 'strategy'
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 3. Add budget review (monthly, first week)
-- ============================================================================
INSERT INTO scheduled_jobs (agent_id, cron_expression, task_type, title, priority, description, enabled)
SELECT
  a.id,
  '0 10 1-7 * 2',
  'budget_allocation',
  'Månadsvis budgetgenomgång',
  'normal',
  'Månadsvis budgetgenomgång och omfördelning baserat på ROI',
  true
FROM agents a
WHERE a.slug = 'strategy'
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 4. Update escalation_threshold from 1 to 3 (align with Intelligence)
-- ============================================================================
UPDATE agents
SET config_json = COALESCE(config_json, '{}'::jsonb) || '{"escalation_threshold": 3}'::jsonb
WHERE slug = 'strategy';
