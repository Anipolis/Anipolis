-- Allow anime with an unknown episode count.
-- Some currently airing or upcoming shows do not have an announced total yet.

ALTER TABLE public.anime
  ALTER COLUMN episode_count DROP NOT NULL;

ALTER TABLE public.anime
  DROP CONSTRAINT IF EXISTS anime_episode_count_positive;

ALTER TABLE public.anime
  ADD CONSTRAINT anime_episode_count_positive
  CHECK (episode_count IS NULL OR episode_count >= 1);
