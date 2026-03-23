-- Seed the scheduled_jobs table with the previously hardcoded schedule entries.
-- Uses ON CONFLICT to avoid duplicates if re-run.

-- Ensure table exists (created via frontend migration, but backend needs it too)
CREATE TABLE IF NOT EXISTS public.scheduled_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  cron_expression text NOT NULL,
  task_type text NOT NULL,
  title text NOT NULL,
  priority text NOT NULL DEFAULT 'normal',
  description text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_triggered_at timestamptz DEFAULT NULL
);

-- Add unique constraint for deduplication (agent + task_type + cron = one job)
ALTER TABLE public.scheduled_jobs
  ADD CONSTRAINT scheduled_jobs_agent_task_cron_uniq
  UNIQUE (agent_id, task_type, cron_expression);

-- Seed the 10 default schedule entries
INSERT INTO public.scheduled_jobs (agent_id, cron_expression, task_type, title, priority, description, enabled)
SELECT a.id, '30 6 * * 1-5', 'morning_scan', 'Intelligence morgonscan', 'normal', 'Automatisk morgonscan av nyheter och trender', true
FROM public.agents a WHERE a.slug = 'intelligence'
ON CONFLICT (agent_id, task_type, cron_expression) DO NOTHING;

INSERT INTO public.scheduled_jobs (agent_id, cron_expression, task_type, title, priority, description, enabled)
SELECT a.id, '0 7 * * 1-5', 'morning_pulse', 'Analytics morgonpuls', 'normal', 'Daglig KPI-sammanfattning', true
FROM public.agents a WHERE a.slug = 'analytics'
ON CONFLICT (agent_id, task_type, cron_expression) DO NOTHING;

INSERT INTO public.scheduled_jobs (agent_id, cron_expression, task_type, title, priority, description, enabled)
SELECT a.id, '0 8 * * 1', 'weekly_planning', 'Strategy veckoplanering', 'normal', 'Veckovis strategiplanering', true
FROM public.agents a WHERE a.slug = 'strategy'
ON CONFLICT (agent_id, task_type, cron_expression) DO NOTHING;

INSERT INTO public.scheduled_jobs (agent_id, cron_expression, task_type, title, priority, description, enabled)
SELECT a.id, '0 9 * * 1,3,5', 'scheduled_content', 'Content schemalagt innehåll', 'normal', 'Schemalagd innehållsproduktion', true
FROM public.agents a WHERE a.slug = 'content'
ON CONFLICT (agent_id, task_type, cron_expression) DO NOTHING;

INSERT INTO public.scheduled_jobs (agent_id, cron_expression, task_type, title, priority, description, enabled)
SELECT a.id, '0 9 * * 1', 'weekly_intelligence', 'Intelligence veckobriefing', 'normal', 'Veckovis underrättelserapport', true
FROM public.agents a WHERE a.slug = 'intelligence'
ON CONFLICT (agent_id, task_type, cron_expression) DO NOTHING;

INSERT INTO public.scheduled_jobs (agent_id, cron_expression, task_type, title, priority, description, enabled)
SELECT a.id, '0 10 * * *', 'lead_scoring', 'Lead scoring-uppdatering', 'normal', 'Daglig lead scoring', true
FROM public.agents a WHERE a.slug = 'lead'
ON CONFLICT (agent_id, task_type, cron_expression) DO NOTHING;

INSERT INTO public.scheduled_jobs (agent_id, cron_expression, task_type, title, priority, description, enabled)
SELECT a.id, '0 13 * * 1-5', 'midday_sweep', 'Intelligence middagssweep', 'normal', 'Middagsscan av nyheter', true
FROM public.agents a WHERE a.slug = 'intelligence'
ON CONFLICT (agent_id, task_type, cron_expression) DO NOTHING;

INSERT INTO public.scheduled_jobs (agent_id, cron_expression, task_type, title, priority, description, enabled)
SELECT a.id, '0 14 * * 5', 'weekly_report', 'Analytics veckorapport', 'normal', 'Veckovis analysrapport', true
FROM public.agents a WHERE a.slug = 'analytics'
ON CONFLICT (agent_id, task_type, cron_expression) DO NOTHING;

INSERT INTO public.scheduled_jobs (agent_id, cron_expression, task_type, title, priority, description, enabled)
SELECT a.id, '0 9 1-7 * 1', 'monthly_planning', 'Strategy månadsplanering', 'normal', 'Månadsvis strategiplanering (första måndagen)', true
FROM public.agents a WHERE a.slug = 'strategy'
ON CONFLICT (agent_id, task_type, cron_expression) DO NOTHING;

INSERT INTO public.scheduled_jobs (agent_id, cron_expression, task_type, title, priority, description, enabled)
SELECT a.id, '0 9 25-31 3,6,9,12 5', 'quarterly_review', 'Analytics kvartalsöversikt', 'normal', 'Kvartalsvis analysöversikt (sista fredagen)', true
FROM public.agents a WHERE a.slug = 'analytics'
ON CONFLICT (agent_id, task_type, cron_expression) DO NOTHING;
