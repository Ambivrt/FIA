-- Migration 020: Add result_json to commands table
-- Allows commands to return structured data (e.g., drive folder contents).

ALTER TABLE commands ADD COLUMN IF NOT EXISTS result_json jsonb;
