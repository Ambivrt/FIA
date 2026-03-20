-- FIA Gateway – Seed Data
-- Run after 001_initial_schema.sql
-- Seeds all 8 agent clusters with config_json

INSERT INTO agents (name, slug, status, autonomy_level, config_json) VALUES
  ('Strategy Agent', 'strategy', 'idle', 'semi-autonomous', '{
    "routing": {"default": "claude-opus", "research": "google-search", "trend_analysis": "google-search"},
    "tools": ["gws:analytics", "gws:calendar", "gws:sheets", "hubspot"],
    "task_types": ["quarterly_plan", "monthly_plan", "campaign_brief", "research", "trend_analysis"],
    "autonomy": "semi-autonomous",
    "sample_review_rate": 1.0,
    "escalation_threshold": 1,
    "max_iterations": 5,
    "_manifest_version": "1.0.0"
  }'::jsonb),
  ('Content Agent', 'content', 'idle', 'autonomous', '{
    "routing": {"default": "claude-opus", "metadata": "claude-sonnet", "alt_text": "claude-sonnet", "ab_variants": "claude-sonnet", "images": "nano-banana-2"},
    "tools": ["buffer", "gws:drive", "gws:docs"],
    "task_types": ["blog_post", "linkedin", "newsletter", "case_study", "whitepaper", "metadata", "alt_text", "ab_variants", "images"],
    "autonomy": "autonomous",
    "sample_review_rate": 0.2,
    "escalation_threshold": 3,
    "max_iterations": 5,
    "self_eval": {"enabled": true, "model": "claude-sonnet", "criteria": ["Följer innehållet Forefronts tonalitet och varumärkesriktlinjer?", "Är texten engagerande, konkret och fri från floskler?", "Uppfyller innehållet briefens krav på format, längd och målgrupp?"], "threshold": 0.7},
    "_manifest_version": "1.0.0"
  }'::jsonb),
  ('Campaign Agent', 'campaign', 'idle', 'autonomous', '{
    "routing": {"default": "claude-opus", "ab_variants": "claude-sonnet", "segmentation": "claude-sonnet"},
    "tools": ["hubspot", "linkedin", "buffer"],
    "task_types": ["ab_variants", "segmentation"],
    "autonomy": "autonomous",
    "sample_review_rate": 0.33,
    "escalation_threshold": 3,
    "max_iterations": 5,
    "budget_limit_sek": 10000,
    "self_eval": {"enabled": true, "model": "claude-sonnet", "criteria": ["Är kampanjens budskap i linje med Forefronts varumärke?", "Är målgruppssegmenteringen relevant och väldefinierad?", "Håller kampanjen sig inom budget och KPI-ramar?"], "threshold": 0.7},
    "_manifest_version": "1.0.0"
  }'::jsonb),
  ('SEO Agent', 'seo', 'idle', 'autonomous', '{
    "routing": {"default": "google-search", "bulk_optimization": "claude-sonnet", "content_recommendations": "claude-opus"},
    "tools": ["gws:analytics", "gws:sheets"],
    "task_types": ["seo_audit", "bulk_optimization", "content_recommendations"],
    "autonomy": "autonomous",
    "sample_review_rate": 0.05,
    "escalation_threshold": 3,
    "max_iterations": 5,
    "_manifest_version": "1.0.0"
  }'::jsonb),
  ('Lead Agent', 'lead', 'idle', 'autonomous', '{
    "routing": {"default": "claude-sonnet", "nurture_sequences": "claude-opus"},
    "tools": ["hubspot"],
    "task_types": ["nurture_sequences"],
    "autonomy": "autonomous",
    "sample_review_rate": 0.1,
    "escalation_threshold": 3,
    "max_iterations": 5,
    "score_threshold_mql": 75,
    "_manifest_version": "1.0.0"
  }'::jsonb),
  ('Analytics Agent', 'analytics', 'idle', 'autonomous', '{
    "routing": {"default": "claude-sonnet", "insights": "claude-opus", "report_writing": "claude-opus"},
    "tools": ["gws:analytics", "gws:sheets", "gws:drive", "hubspot"],
    "task_types": ["morning_pulse", "weekly_report", "quarterly_review", "insights", "report_writing"],
    "autonomy": "autonomous",
    "sample_review_rate": 0.05,
    "escalation_threshold": 3,
    "max_iterations": 5,
    "_manifest_version": "1.0.0"
  }'::jsonb),
  ('Brand Agent', 'brand', 'idle', 'autonomous', '{
    "routing": {"default": "claude-opus"},
    "tools": [],
    "task_types": [],
    "autonomy": "autonomous",
    "sample_review_rate": 0.0,
    "escalation_threshold": 3,
    "max_iterations": 5,
    "has_veto": true,
    "_manifest_version": "1.0.0"
  }'::jsonb),
  ('Intelligence Agent', 'intelligence', 'idle', 'autonomous', '{
    "routing": {"default": "claude-sonnet", "deep_analysis": "claude-opus", "search": "google-search"},
    "tools": ["gws:drive", "gws:docs", "gws:sheets"],
    "task_types": ["morning_scan", "midday_sweep", "weekly_intelligence", "rapid_response", "deep_analysis", "search"],
    "autonomy": "autonomous",
    "sample_review_rate": 0.2,
    "escalation_threshold": 3,
    "max_iterations": 5,
    "self_eval": {"enabled": true, "model": "claude-sonnet", "criteria": ["Är alla fynd relevanta för Forefront och bevakningsdomänerna?", "Är scoring-motiveringar tydliga och konsekventa?", "Är briefen koncis och handlingsorienterad?"], "threshold": 0.7},
    "_manifest_version": "1.1.0"
  }'::jsonb);
