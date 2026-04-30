-- studio, producer, official_hashtag を text[] に変更（ジャンルと同様に複数登録可能）
ALTER TABLE public.anime
  ALTER COLUMN studio TYPE text[]
    USING CASE WHEN studio IS NULL THEN NULL ELSE ARRAY[studio] END,
  ALTER COLUMN producer TYPE text[]
    USING CASE WHEN producer IS NULL THEN NULL ELSE ARRAY[producer] END,
  ALTER COLUMN official_hashtag TYPE text[]
    USING CASE WHEN official_hashtag IS NULL THEN NULL ELSE ARRAY[official_hashtag] END;

-- デフォルト値を空配列に統一
ALTER TABLE public.anime
  ALTER COLUMN studio SET DEFAULT '{}',
  ALTER COLUMN producer SET DEFAULT '{}',
  ALTER COLUMN official_hashtag SET DEFAULT '{}';

-- GIN インデックスを追加（contains クエリの高速化）
CREATE INDEX IF NOT EXISTS anime_studio_idx  ON public.anime USING GIN (studio);
CREATE INDEX IF NOT EXISTS anime_producer_idx ON public.anime USING GIN (producer);
CREATE INDEX IF NOT EXISTS anime_hashtag_idx  ON public.anime USING GIN (official_hashtag);
