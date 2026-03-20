-- Backfill config_json for all agents
-- Only updates agents with empty config_json to avoid overwriting admin customizations

UPDATE agents SET config_json = '{
  "routing": {"default": "claude-opus", "research": "google-search", "trend_analysis": "google-search"},
  "tools": ["gws:analytics", "gws:calendar", "gws:sheets", "hubspot"],
  "task_types": ["quarterly_plan", "monthly_plan", "campaign_brief", "research", "trend_analysis"],
  "autonomy": "semi-autonomous",
  "sample_review_rate": 1.0,
  "escalation_threshold": 1,
  "max_iterations": 5,
  "_manifest_version": "1.0.0"
}'::jsonb
WHERE slug = 'strategy' AND (config_json IS NULL OR config_json = '{}'::jsonb);

UPDATE agents SET config_json = '{
  "routing": {"default": "claude-opus", "metadata": "claude-sonnet", "alt_text": "claude-sonnet", "ab_variants": "claude-sonnet", "images": "nano-banana-2"},
  "tools": ["buffer", "gws:drive", "gws:docs"],
  "task_types": ["blog_post", "linkedin", "newsletter", "case_study", "whitepaper", "metadata", "alt_text", "ab_variants", "images"],
  "autonomy": "autonomous",
  "sample_review_rate": 0.2,
  "escalation_threshold": 3,
  "max_iterations": 5,
  "_manifest_version": "1.0.0"
}'::jsonb
WHERE slug = 'content' AND (config_json IS NULL OR config_json = '{}'::jsonb);

UPDATE agents SET config_json = '{
  "routing": {"default": "claude-opus", "ab_variants": "claude-sonnet", "segmentation": "claude-sonnet"},
  "tools": ["hubspot", "linkedin", "buffer"],
  "task_types": ["ab_variants", "segmentation"],
  "autonomy": "autonomous",
  "sample_review_rate": 0.33,
  "escalation_threshold": 3,
  "max_iterations": 5,
  "budget_limit_sek": 10000,
  "_manifest_version": "1.0.0"
}'::jsonb
WHERE slug = 'campaign' AND (config_json IS NULL OR config_json = '{}'::jsonb);

UPDATE agents SET config_json = '{
  "routing": {"default": "google-search", "bulk_optimization": "claude-sonnet", "content_recommendations": "claude-opus"},
  "tools": ["gws:analytics", "gws:sheets"],
  "task_types": ["seo_audit", "bulk_optimization", "content_recommendations"],
  "autonomy": "autonomous",
  "sample_review_rate": 0.05,
  "escalation_threshold": 3,
  "max_iterations": 5,
  "_manifest_version": "1.0.0"
}'::jsonb
WHERE slug = 'seo' AND (config_json IS NULL OR config_json = '{}'::jsonb);

UPDATE agents SET config_json = '{
  "routing": {"default": "claude-sonnet", "nurture_sequences": "claude-opus"},
  "tools": ["hubspot"],
  "task_types": ["nurture_sequences"],
  "autonomy": "autonomous",
  "sample_review_rate": 0.1,
  "escalation_threshold": 3,
  "max_iterations": 5,
  "score_threshold_mql": 75,
  "_manifest_version": "1.0.0"
}'::jsonb
WHERE slug = 'lead' AND (config_json IS NULL OR config_json = '{}'::jsonb);

UPDATE agents SET config_json = '{
  "routing": {"default": "claude-sonnet", "insights": "claude-opus", "report_writing": "claude-opus"},
  "tools": ["gws:analytics", "gws:sheets", "gws:drive", "hubspot"],
  "task_types": ["morning_pulse", "weekly_report", "quarterly_review", "insights", "report_writing"],
  "autonomy": "autonomous",
  "sample_review_rate": 0.05,
  "escalation_threshold": 3,
  "max_iterations": 5,
  "_manifest_version": "1.0.0"
}'::jsonb
WHERE slug = 'analytics' AND (config_json IS NULL OR config_json = '{}'::jsonb);

UPDATE agents SET config_json = '{
  "routing": {"default": "claude-opus"},
  "tools": [],
  "task_types": [],
  "autonomy": "autonomous",
  "sample_review_rate": 0.0,
  "escalation_threshold": 3,
  "max_iterations": 5,
  "has_veto": true,
  "_manifest_version": "1.0.0"
}'::jsonb
WHERE slug = 'brand' AND (config_json IS NULL OR config_json = '{}'::jsonb);

-- Intelligence Agent: update if still has the old migration 009 data (no _manifest_version)
UPDATE agents SET config_json = '{
  "routing": {"default": "claude-sonnet", "deep_analysis": "claude-opus", "search": "google-search"},
  "tools": ["gws:drive", "gws:docs", "gws:sheets"],
  "task_types": ["morning_scan", "midday_sweep", "weekly_intelligence", "rapid_response", "deep_analysis", "search"],
  "autonomy": "autonomous",
  "sample_review_rate": 0.2,
  "escalation_threshold": 3,
  "max_iterations": 5,
  "_manifest_version": "1.1.0"
}'::jsonb
WHERE slug = 'intelligence' AND config_json IS NOT NULL AND NOT (config_json ? '_manifest_version');
