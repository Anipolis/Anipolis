-- Add title_romaji column to anime table
ALTER TABLE public.anime
  ADD COLUMN IF NOT EXISTS title_romaji text;

CREATE INDEX IF NOT EXISTS idx_anime_title_romaji ON public.anime (title_romaji);
