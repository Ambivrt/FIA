-- FIA Gateway – Seed Data
-- Run after 001_initial_schema.sql
-- Seeds the 7 agent clusters

INSERT INTO agents (name, slug, status, autonomy_level) VALUES
  ('Strategy Agent',  'strategy',  'idle', 'semi-autonomous'),
  ('Content Agent',   'content',   'idle', 'autonomous'),
  ('Campaign Agent',  'campaign',  'idle', 'autonomous'),
  ('SEO Agent',       'seo',       'idle', 'autonomous'),
  ('Lead Agent',      'lead',      'idle', 'autonomous'),
  ('Analytics Agent', 'analytics', 'idle', 'autonomous'),
  ('Brand Agent',     'brand',     'idle', 'autonomous');
