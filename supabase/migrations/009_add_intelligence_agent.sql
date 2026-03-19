-- Add Intelligence Agent to agents table
INSERT INTO agents (name, slug, status, autonomy_level, config_json) VALUES (
  'Intelligence Agent',
  'intelligence',
  'idle',
  'autonomous',
  '{
    "routing": {
      "default": "claude-sonnet",
      "deep_analysis": "claude-opus",
      "search": "google-search"
    },
    "tools": ["gws:drive", "gws:docs", "gws:sheets"],
    "skills": [
      "shared:forefront-identity",
      "shared:data-driven-reasoning",
      "shared:escalation-protocol",
      "agent:source-monitoring",
      "agent:relevance-scoring",
      "agent:briefing-generation"
    ]
  }'
);
