-- Remove rigid CHECK constraint on tasks.type
-- Task types are defined in agent.yaml manifests (source of truth).
-- New task types (scheduled_content, weekly_planning, monthly_planning,
-- keyword_research, ab_variants, nurture_sequences, etc.) are added via
-- manifests without requiring a database migration.

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_type_check;
