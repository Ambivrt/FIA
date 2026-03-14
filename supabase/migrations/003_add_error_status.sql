-- Add 'error' to tasks.status check constraint.
-- BaseAgent writes status='error' when LLM calls fail, but the original
-- constraint did not include it.

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_status_check
  CHECK (status IN (
    'queued', 'in_progress', 'awaiting_review',
    'approved', 'rejected', 'revision_requested', 'published',
    'error'
  ));
