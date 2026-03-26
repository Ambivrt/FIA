-- 019_intelligence_profiles.sql
-- Intelligence profiles for persistent topic knowledge + sub_status on tasks

-- 1. Intelligence profiles table
CREATE TABLE IF NOT EXISTS intelligence_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_slug text NOT NULL UNIQUE,
  topic_name text NOT NULL,
  category text NOT NULL CHECK (category IN (
    'company', 'competitor', 'trend', 'technology', 'industry'
  )),
  summary text NOT NULL DEFAULT '',
  key_facts jsonb DEFAULT '{}'::jsonb,
  last_updated timestamptz NOT NULL DEFAULT now(),
  research_count integer NOT NULL DEFAULT 0,
  sources jsonb DEFAULT '[]'::jsonb,
  related_profiles text[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_intelligence_profiles_category ON intelligence_profiles(category);
CREATE INDEX idx_intelligence_profiles_topic_slug ON intelligence_profiles(topic_slug);
CREATE INDEX idx_intelligence_profiles_last_updated ON intelligence_profiles(last_updated DESC);

-- Full-text search on topic_name and summary (Swedish)
ALTER TABLE intelligence_profiles ADD COLUMN IF NOT EXISTS fts tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('swedish', coalesce(topic_name, '')), 'A') ||
    setweight(to_tsvector('swedish', coalesce(summary, '')), 'B')
  ) STORED;

CREATE INDEX idx_intelligence_profiles_fts ON intelligence_profiles USING gin(fts);

-- 2. Add sub_status to tasks table
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS sub_status text;

-- 3. RLS
ALTER TABLE intelligence_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_profiles" ON intelligence_profiles
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "service_role_all" ON intelligence_profiles
  FOR ALL USING (auth.role() = 'service_role');

-- 4. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE intelligence_profiles;

COMMENT ON TABLE intelligence_profiles IS 'Persistent intelligence profiles built over time by Intelligence Agent. Searchable from dashboard.';
