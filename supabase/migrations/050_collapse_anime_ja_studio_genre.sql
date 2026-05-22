-- Collapse studio / genre Japanese columns into the canonical display columns.
-- studio and genre are Japanese/display values; studio_en and genre_en keep Jikan English values.

DROP VIEW IF EXISTS public.anime_with_computed_broadcast_status;

UPDATE public.anime
SET
  studio = CASE
    WHEN COALESCE(array_length(studio_ja, 1), 0) > 0 THEN studio_ja
    ELSE studio
  END,
  genre = CASE
    WHEN COALESCE(array_length(genre_ja, 1), 0) > 0 THEN genre_ja
    ELSE genre
  END;

DROP INDEX IF EXISTS public.anime_studio_ja_idx;
DROP INDEX IF EXISTS public.anime_genre_ja_idx;

ALTER TABLE public.anime
  DROP COLUMN IF EXISTS studio_ja,
  DROP COLUMN IF EXISTS genre_ja;

CREATE VIEW public.anime_with_computed_broadcast_status
WITH (security_invoker = true) AS
SELECT
  anime.*,
  CASE
    WHEN aired_from IS NOT NULL AND aired_from > (now() AT TIME ZONE 'Asia/Tokyo')::date
      THEN 'upcoming'
    WHEN aired_to IS NOT NULL AND aired_to < (now() AT TIME ZONE 'Asia/Tokyo')::date
      THEN 'finished'
    WHEN aired_from IS NOT NULL
      AND aired_from <= (now() AT TIME ZONE 'Asia/Tokyo')::date
      AND aired_to IS NULL
      AND regexp_replace(lower(coalesce(type, '')), '[^a-z0-9]', '', 'g') IN ('movie', 'ona', 'ova', 'tvspecial', 'special')
      THEN 'finished'
    WHEN aired_from IS NOT NULL
      AND aired_from <= (now() AT TIME ZONE 'Asia/Tokyo')::date
      AND (aired_to IS NULL OR aired_to >= (now() AT TIME ZONE 'Asia/Tokyo')::date)
      THEN 'airing'
    ELSE 'unknown'
  END AS computed_broadcast_status
FROM public.anime;

GRANT SELECT ON public.anime_with_computed_broadcast_status TO anon, authenticated;
