-- Store studio and genre names in both English and Japanese.
-- Existing studio / genre columns remain for compatibility and can keep Japanese display values.

ALTER TABLE public.anime
  ADD COLUMN IF NOT EXISTS studio_en text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS studio_ja text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS genre_en text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS genre_ja text[] DEFAULT '{}';

UPDATE public.anime
SET
  studio_en = COALESCE(NULLIF(studio_en, '{}'), studio, '{}'),
  studio_ja = COALESCE(NULLIF(studio_ja, '{}'), studio, '{}'),
  genre_en = COALESCE(NULLIF(genre_en, '{}'), genre, '{}'),
  genre_ja = COALESCE(NULLIF(genre_ja, '{}'), genre, '{}');

CREATE INDEX IF NOT EXISTS anime_studio_en_idx ON public.anime USING GIN (studio_en);
CREATE INDEX IF NOT EXISTS anime_studio_ja_idx ON public.anime USING GIN (studio_ja);
CREATE INDEX IF NOT EXISTS anime_genre_en_idx ON public.anime USING GIN (genre_en);
CREATE INDEX IF NOT EXISTS anime_genre_ja_idx ON public.anime USING GIN (genre_ja);

-- Recreate the view so anime.* includes the newly added i18n columns.
DROP VIEW IF EXISTS public.anime_with_computed_broadcast_status;

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
