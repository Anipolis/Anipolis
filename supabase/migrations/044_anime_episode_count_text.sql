-- Store episode counts as text so CSV/direct imports can leave the value blank.
-- Numeric values are still constrained to positive integers.

ALTER TABLE public.anime
  ALTER COLUMN episode_count DROP NOT NULL;

ALTER TABLE public.anime
  DROP CONSTRAINT IF EXISTS anime_episode_count_positive;

ALTER TABLE public.anime
  ALTER COLUMN episode_count TYPE text
  USING episode_count::text;

ALTER TABLE public.anime
  ADD CONSTRAINT anime_episode_count_positive
  CHECK (
    episode_count IS NULL
    OR btrim(episode_count) = ''
    OR episode_count ~ '^[1-9][0-9]*$'
  );
