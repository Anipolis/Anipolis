-- Connect anime table to other entities
-- posts: optional anime reference (review/discussion posts)
-- events: optional anime reference (viewing party events)

ALTER TABLE posts  ADD COLUMN IF NOT EXISTS anime_id bigint REFERENCES anime(id) ON DELETE SET NULL;
ALTER TABLE events ADD COLUMN IF NOT EXISTS anime_id bigint REFERENCES anime(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS posts_anime_id_idx  ON posts  (anime_id) WHERE anime_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS events_anime_id_idx ON events (anime_id) WHERE anime_id IS NOT NULL;
