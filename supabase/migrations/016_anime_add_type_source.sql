-- Drop dependent views
DROP VIEW IF EXISTS anime_top_rated;
DROP VIEW IF EXISTS anime_trending;
DROP VIEW IF EXISTS anime_popularity;

-- Rebuild anime table with type and source columns
DROP TABLE IF EXISTS anime CASCADE;

CREATE TABLE anime (
  id            bigint generated always as identity primary key,
  title         text not null,
  title_en      text,
  title_romaji  text,
  cover_url     text,
  synopsis      text,
  episode_count integer,
  type          text,
  aired_from    date,
  aired_to      date,
  status        text,
  season        text,
  source        text,
  studio        text,
  producer      text,
  genre         text[],
  official_site_url  text,
  official_x_url     text,
  official_hashtag   text,
  copyright     text,
  created_at    timestamptz default now()
);

CREATE INDEX anime_season_idx     ON anime (season);
CREATE INDEX anime_status_idx     ON anime (status);
CREATE INDEX anime_created_idx    ON anime (created_at DESC);
CREATE INDEX anime_romaji_idx     ON anime (title_romaji);
CREATE INDEX anime_genre_idx      ON anime USING GIN (genre);

ALTER TABLE anime ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anime: 誰でも読める" ON anime FOR SELECT USING (true);

-- Recreate ranking views
CREATE VIEW anime_popularity AS
  SELECT *, 0 AS score FROM anime;

CREATE VIEW anime_trending AS
  SELECT *, 0 AS trending_score FROM anime;

CREATE VIEW anime_top_rated AS
  SELECT *, 0 AS rating FROM anime;
