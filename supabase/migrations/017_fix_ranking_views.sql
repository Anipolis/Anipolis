-- Migration 016 changed anime.id from uuid to bigint, but user_anime_list.anime_id
-- remained uuid. Fix the type mismatch and recreate ranking views with correct columns.

DROP VIEW IF EXISTS anime_top_rated;
DROP VIEW IF EXISTS anime_trending;
DROP VIEW IF EXISTS anime_popularity;

-- Fix user_anime_list: anime.id changed from uuid→bigint in migration 016,
-- so anime_id column must be rebuilt. Any existing rows are invalid (uuid references
-- no longer exist), so we recreate the table fresh.
DROP TABLE IF EXISTS user_anime_list CASCADE;

CREATE TABLE public.user_anime_list (
  user_id   uuid    NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  anime_id  bigint  NOT NULL REFERENCES public.anime(id)   ON DELETE CASCADE,
  status    text    NOT NULL CHECK (status IN ('watching','completed','plan_to_watch','dropped','on_hold')),
  score     smallint CHECK (score BETWEEN 1 AND 10),
  progress  integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, anime_id)
);

ALTER TABLE user_anime_list ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_anime_list: 誰でも読める"       ON user_anime_list FOR SELECT USING (true);
CREATE POLICY "user_anime_list: 自分のみ編集可能"   ON user_anime_list FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_anime_list: 自分のみ更新可能"   ON user_anime_list FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "user_anime_list: 自分のみ削除可能"   ON user_anime_list FOR DELETE USING (auth.uid() = user_id);

-- Popularity: ranked by total user_anime_list entries
CREATE VIEW anime_popularity AS
SELECT
  a.id AS anime_id,
  COUNT(ual.anime_id) AS list_count
FROM anime a
LEFT JOIN user_anime_list ual ON ual.anime_id = a.id
GROUP BY a.id;

-- Trending: ranked by user_anime_list activity in last 7 days
CREATE VIEW anime_trending AS
SELECT
  a.id AS anime_id,
  COUNT(ual.anime_id) AS recent_count
FROM anime a
LEFT JOIN user_anime_list ual
  ON ual.anime_id = a.id
  AND ual.updated_at >= now() - interval '7 days'
GROUP BY a.id;

-- Top rated: ranked by average user score
CREATE VIEW anime_top_rated AS
SELECT
  a.id AS anime_id,
  COALESCE(AVG(ual.score) FILTER (WHERE ual.score IS NOT NULL), 0) AS avg_score,
  COUNT(ual.score) FILTER (WHERE ual.score IS NOT NULL) AS score_count
FROM anime a
LEFT JOIN user_anime_list ual ON ual.anime_id = a.id
GROUP BY a.id;
