-- FIA Gateway – Initial Schema
-- Run in Supabase SQL Editor (or via supabase db push)
--
-- 6 tables: profiles, agents, tasks, approvals, metrics, activity_log
-- RLS enabled on all tables
-- Designed for Gateway (writes via service role key) + Dashboard (reads via anon key + JWT)

-- ============================================================================
-- 1. PROFILES – linked 1:1 with auth.users
-- ============================================================================

CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  role text NOT NULL DEFAULT 'viewer'
    CHECK (role IN ('orchestrator', 'admin', 'viewer')),
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE profiles IS 'User profiles linked to Supabase Auth. Roles: orchestrator (full access), admin (tech + config), viewer (read-only).';

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    'viewer'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================================
-- 2. AGENTS – the 7 AI agent clusters
-- ============================================================================

CREATE TABLE agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE
    CHECK (slug ~ '^[a-z][a-z0-9_-]*$'),
  status text NOT NULL DEFAULT 'idle'
    CHECK (status IN ('active', 'paused', 'error', 'idle')),
  autonomy_level text NOT NULL
    CHECK (autonomy_level IN ('autonomous', 'semi-autonomous', 'manual')),
  last_heartbeat timestamptz,
  config_json jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_agents_slug ON agents(slug);
CREATE INDEX idx_agents_status ON agents(status);

COMMENT ON TABLE agents IS 'Register of the 7 FIA agent clusters. Gateway writes heartbeats; Dashboard reads status.';

-- ============================================================================
-- 3. TASKS – all work items produced by agents
-- ============================================================================

CREATE TABLE tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  type text NOT NULL
    CHECK (type IN (
      'blog_post', 'social_media', 'newsletter', 'campaign',
      'report', 'review', 'case_study', 'whitepaper',
      'email_sequence', 'ad_copy', 'landing_page',
      'seo_audit', 'lead_scoring', 'nurture_email',
      'morning_pulse', 'weekly_report', 'quarterly_review',
      'image', 'other'
    )),
  title text NOT NULL,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN (
      'queued', 'in_progress', 'awaiting_review',
      'approved', 'rejected', 'revision_requested', 'published'
    )),
  priority text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  content_json jsonb DEFAULT '{}'::jsonb,
  model_used text,
  tokens_used integer,
  cost_sek numeric(10, 4),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX idx_tasks_agent_id ON tasks(agent_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_type ON tasks(type);
CREATE INDEX idx_tasks_created_at ON tasks(created_at DESC);
CREATE INDEX idx_tasks_priority ON tasks(priority);

COMMENT ON TABLE tasks IS 'All work items produced by agents. Central table for the approval flow.';

-- ============================================================================
-- 4. APPROVALS – review history per task
-- ============================================================================

CREATE TABLE approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  reviewer_type text NOT NULL
    CHECK (reviewer_type IN ('brand_agent', 'orchestrator', 'admin', 'ledningsgrupp')),
  reviewer_id uuid REFERENCES profiles(id),  -- null if brand_agent
  decision text NOT NULL
    CHECK (decision IN ('approved', 'rejected', 'revision_requested')),
  feedback text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_approvals_task_id ON approvals(task_id);
CREATE INDEX idx_approvals_decision ON approvals(decision);

COMMENT ON TABLE approvals IS 'Review history per task. Both Brand Agent reviews and human approvals.';

-- ============================================================================
-- 5. METRICS – KPI data per period
-- ============================================================================

CREATE TABLE metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL
    CHECK (category IN ('content', 'traffic', 'leads', 'cost', 'brand')),
  metric_name text NOT NULL,
  value numeric NOT NULL,
  period text NOT NULL
    CHECK (period IN ('daily', 'weekly', 'monthly')),
  period_start date NOT NULL,
  metadata_json jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_metrics_category ON metrics(category);
CREATE INDEX idx_metrics_period ON metrics(period, period_start);
CREATE INDEX idx_metrics_name ON metrics(metric_name);

COMMENT ON TABLE metrics IS 'KPI data per period. Analytics Agent writes; Dashboard reads for charts.';

-- ============================================================================
-- 6. ACTIVITY_LOG – searchable audit trail
-- ============================================================================

CREATE TABLE activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid REFERENCES agents(id) ON DELETE SET NULL,
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  details_json jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_activity_log_agent_id ON activity_log(agent_id);
CREATE INDEX idx_activity_log_user_id ON activity_log(user_id);
CREATE INDEX idx_activity_log_action ON activity_log(action);
CREATE INDEX idx_activity_log_created_at ON activity_log(created_at DESC);

COMMENT ON TABLE activity_log IS 'Audit trail. Every agent decision and human action is logged here.';

-- ============================================================================
-- 7. ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- Helper: get current user's role
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = ''
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- ---- PROFILES ----

-- All authenticated users can read all profiles
CREATE POLICY "profiles_select"
  ON profiles FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Users can update their own profile (name, avatar)
CREATE POLICY "profiles_update_own"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ---- AGENTS ----

-- All authenticated users can read agents
CREATE POLICY "agents_select"
  ON agents FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Orchestrator and admin can update agents (pause, resume, config)
CREATE POLICY "agents_update"
  ON agents FOR UPDATE
  USING (public.get_user_role() IN ('orchestrator', 'admin'));

-- ---- TASKS ----

-- All authenticated users can read tasks
CREATE POLICY "tasks_select"
  ON tasks FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Orchestrator and admin can update tasks (approve, reject)
CREATE POLICY "tasks_update"
  ON tasks FOR UPDATE
  USING (public.get_user_role() IN ('orchestrator', 'admin'));

-- Gateway inserts tasks via service role key (bypasses RLS)
-- But allow orchestrator/admin to create tasks manually too
CREATE POLICY "tasks_insert"
  ON tasks FOR INSERT
  WITH CHECK (public.get_user_role() IN ('orchestrator', 'admin'));

-- ---- APPROVALS ----

-- All authenticated users can read approvals
CREATE POLICY "approvals_select"
  ON approvals FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Orchestrator and admin can create approvals
CREATE POLICY "approvals_insert"
  ON approvals FOR INSERT
  WITH CHECK (public.get_user_role() IN ('orchestrator', 'admin'));

-- ---- METRICS ----

-- All authenticated users can read metrics
CREATE POLICY "metrics_select"
  ON metrics FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ---- ACTIVITY_LOG ----

-- All authenticated users can read activity log
CREATE POLICY "activity_log_select"
  ON activity_log FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ============================================================================
-- 8. REALTIME – enable for Dashboard live updates
-- ============================================================================

-- Enable realtime for tables the Dashboard subscribes to
ALTER PUBLICATION supabase_realtime ADD TABLE agents;
ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE approvals;
ALTER PUBLICATION supabase_realtime ADD TABLE activity_log;
