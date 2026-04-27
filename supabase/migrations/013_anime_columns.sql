-- Add new columns to anime table
ALTER TABLE public.anime
  ADD COLUMN IF NOT EXISTS studio text,
  ADD COLUMN IF NOT EXISTS producer text,
  ADD COLUMN IF NOT EXISTS genre text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS official_site_url text,
  ADD COLUMN IF NOT EXISTS official_x_url text,
  ADD COLUMN IF NOT EXISTS official_hashtag text,
  ADD COLUMN IF NOT EXISTS copyright text;

-- Index for genre array search (@> operator)
CREATE INDEX IF NOT EXISTS anime_genre_idx ON public.anime USING GIN (genre);
