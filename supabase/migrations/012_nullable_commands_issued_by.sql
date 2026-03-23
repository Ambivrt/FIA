-- Migration 012: Make commands.issued_by nullable to support CLI-originated commands
-- CLI auth uses a non-UUID identifier, so issued_by cannot always reference profiles(id).

ALTER TABLE commands ALTER COLUMN issued_by DROP NOT NULL;
