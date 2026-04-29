-- ================================================================
-- 015: anime テーブルを列順整理のため再作成
-- 013/014 で末尾追加されたカラムを論理的な順序に並べ直す
-- ================================================================

-- 依存ビューを先に削除
DROP VIEW IF EXISTS public.anime_top_rated;
DROP VIEW IF EXISTS public.anime_trending;
DROP VIEW IF EXISTS public.anime_popularity;

-- テーブル再作成
DROP TABLE IF EXISTS public.anime CASCADE;

CREATE TABLE public.anime (
    id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    title             text        NOT NULL,
    title_en          text,
    title_romaji      text,
    cover_url         text,
    synopsis          text,
    episode_count     int,
    aired_from        date,
    aired_to          date,
    status            text        NOT NULL DEFAULT 'airing'
                                  CHECK (status IN ('airing', 'finished', 'upcoming')),
    season            text,                        -- 例: '2025-spring'
    studio            text,
    producer          text,
    genre             text[]      DEFAULT '{}',
    official_site_url text,
    official_x_url    text,
    official_hashtag  text,
    copyright         text,
    created_at        timestamptz NOT NULL DEFAULT now()
);

-- インデックス
CREATE INDEX idx_anime_season      ON public.anime (season);
CREATE INDEX idx_anime_status      ON public.anime (status);
CREATE INDEX idx_anime_created_at  ON public.anime (created_at DESC);
CREATE INDEX idx_anime_title_romaji ON public.anime (title_romaji);
CREATE INDEX anime_genre_idx       ON public.anime USING GIN (genre);

-- RLS
ALTER TABLE public.anime ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anime: 誰でも読める"
    ON public.anime FOR SELECT USING (true);

-- ----------------------------------------------------------------
-- ランキングビュー再作成
-- ----------------------------------------------------------------

CREATE VIEW public.anime_popularity AS
SELECT
    a.id               AS anime_id,
    COUNT(ual.user_id) AS list_count
FROM public.anime a
LEFT JOIN public.user_anime_list ual ON ual.anime_id = a.id
GROUP BY a.id;

CREATE VIEW public.anime_trending AS
SELECT
    a.id               AS anime_id,
    COUNT(ual.user_id) AS recent_count
FROM public.anime a
LEFT JOIN public.user_anime_list ual
    ON ual.anime_id = a.id
    AND ual.updated_at > now() - interval '7 days'
GROUP BY a.id;

CREATE VIEW public.anime_top_rated AS
SELECT
    a.id               AS anime_id,
    AVG(ual.score)     AS avg_score,
    COUNT(ual.score)   AS score_count
FROM public.anime a
LEFT JOIN public.user_anime_list ual
    ON ual.anime_id = a.id
    AND ual.score IS NOT NULL
GROUP BY a.id;
