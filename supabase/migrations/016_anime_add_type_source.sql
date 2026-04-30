-- Drop dependent views
DROP VIEW IF EXISTS anime_top_rated;
DROP VIEW IF EXISTS anime_trending;
DROP VIEW IF EXISTS anime_popularity;

-- Add type and source columns without dropping the table
ALTER TABLE anime ADD COLUMN IF NOT EXISTS type   text;
ALTER TABLE anime ADD COLUMN IF NOT EXISTS source text;

CREATE INDEX IF NOT EXISTS anime_season_idx  ON anime (season);
CREATE INDEX IF NOT EXISTS anime_status_idx  ON anime (status);
CREATE INDEX IF NOT EXISTS anime_created_idx ON anime (created_at DESC);
CREATE INDEX IF NOT EXISTS anime_romaji_idx  ON anime (title_romaji);
CREATE INDEX IF NOT EXISTS anime_genre_idx   ON anime USING GIN (genre);

ALTER TABLE anime ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anime: 誰でも読める" ON anime;
CREATE POLICY "anime: 誰でも読める" ON anime FOR SELECT USING (true);

-- Recreate ranking views
CREATE VIEW anime_popularity AS
  SELECT *, 0 AS score FROM anime;

CREATE VIEW anime_trending AS
  SELECT *, 0 AS trending_score FROM anime;

CREATE VIEW anime_top_rated AS
  SELECT *, 0 AS rating FROM anime;
