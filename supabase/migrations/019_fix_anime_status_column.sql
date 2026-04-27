-- Migration 016 recreated the anime table without NOT NULL / DEFAULT / CHECK on status.
-- This migration restores those constraints and fixes any NULL rows.

-- Fix NULL or invalid status rows
UPDATE anime SET status = 'airing'
WHERE status IS NULL OR status NOT IN ('airing', 'finished', 'upcoming');

-- Restore NOT NULL, default, and check constraint
ALTER TABLE anime
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN status SET DEFAULT 'airing',
  ADD CONSTRAINT anime_status_check CHECK (status IN ('airing', 'finished', 'upcoming'));
