-- Store the MyAnimeList/Jikan identifier so seasonal imports can upsert safely.

ALTER TABLE public.anime
  ADD COLUMN IF NOT EXISTS mal_id bigint;

CREATE UNIQUE INDEX IF NOT EXISTS anime_mal_id_key
  ON public.anime (mal_id);
