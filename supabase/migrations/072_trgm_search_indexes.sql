-- ================================================================
-- 072: 部分一致検索（ilike '%q%'）用の pg_trgm GIN インデックス
--
-- アニメ検索・ユーザー検索・投稿全文検索はすべて中間一致 ILIKE で、
-- B-tree インデックスが効かずテーブルが育つほど全件スキャンになる。
-- trigram GIN インデックスで ILIKE '%...%' をインデックススキャン化する。
-- ================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- アニメ検索（getAnimeList / getAnimeCount / /api/anime/search）
CREATE INDEX IF NOT EXISTS anime_title_trgm_idx
    ON public.anime USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS anime_title_en_trgm_idx
    ON public.anime USING gin (title_en gin_trgm_ops);

-- シーズンフィルター（season.ilike）
CREATE INDEX IF NOT EXISTS anime_season_trgm_idx
    ON public.anime USING gin (season gin_trgm_ops);

-- ユーザー検索（/api/users/search・検索ページ）
CREATE INDEX IF NOT EXISTS profiles_username_trgm_idx
    ON public.profiles USING gin (username gin_trgm_ops);
CREATE INDEX IF NOT EXISTS profiles_display_name_trgm_idx
    ON public.profiles USING gin (display_name gin_trgm_ops);

-- 投稿の本文検索（検索ページ）
CREATE INDEX IF NOT EXISTS posts_content_trgm_idx
    ON public.posts USING gin (content gin_trgm_ops);
