-- ================================================================
-- 012: アニメデータベース
-- ================================================================

-- ----------------------------------------------------------------
-- 1. anime（作品）
-- ----------------------------------------------------------------
CREATE TABLE public.anime (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title         text NOT NULL,
    title_en      text,
    synopsis      text,
    cover_url     text,
    season        text,           -- 例: '2025-spring', '2025-summer'
    episode_count int,
    status        text NOT NULL DEFAULT 'airing'
                      CHECK (status IN ('airing', 'finished', 'upcoming')),
    aired_from    date,
    aired_to      date,
    created_at    timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_anime_season     ON public.anime (season);
CREATE INDEX idx_anime_status     ON public.anime (status);
CREATE INDEX idx_anime_created_at ON public.anime (created_at DESC);

ALTER TABLE public.anime ENABLE ROW LEVEL SECURITY;

-- 誰でも閲覧可、書き込みはサービスロール（管理者）のみ
CREATE POLICY "anime: 誰でも読める"
    ON public.anime FOR SELECT USING (true);

-- ----------------------------------------------------------------
-- 2. user_anime_list（マイリスト）
-- ----------------------------------------------------------------
CREATE TABLE public.user_anime_list (
    user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    anime_id   uuid NOT NULL REFERENCES public.anime(id) ON DELETE CASCADE,
    status     text NOT NULL
                   CHECK (status IN ('watching', 'completed', 'plan_to_watch', 'dropped', 'on_hold')),
    score      smallint CHECK (score BETWEEN 1 AND 10),
    progress   int NOT NULL DEFAULT 0,
    updated_at timestamptz DEFAULT now() NOT NULL,
    PRIMARY KEY (user_id, anime_id)
);

CREATE INDEX idx_user_anime_list_user    ON public.user_anime_list (user_id);
CREATE INDEX idx_user_anime_list_anime   ON public.user_anime_list (anime_id);
CREATE INDEX idx_user_anime_list_updated ON public.user_anime_list (updated_at DESC);

ALTER TABLE public.user_anime_list ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_anime_list: 誰でも読める"
    ON public.user_anime_list FOR SELECT USING (true);

CREATE POLICY "user_anime_list: 自分のリストを追加・更新可"
    ON public.user_anime_list FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_anime_list: 自分のリストを更新可"
    ON public.user_anime_list FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "user_anime_list: 自分のリストから削除可"
    ON public.user_anime_list FOR DELETE USING (auth.uid() = user_id);

-- ----------------------------------------------------------------
-- 3. ランキングビュー
-- ----------------------------------------------------------------

-- POPULAR: 総マイリスト登録数
CREATE VIEW public.anime_popularity AS
SELECT
    a.id          AS anime_id,
    COUNT(ual.user_id) AS list_count
FROM public.anime a
LEFT JOIN public.user_anime_list ual ON ual.anime_id = a.id
GROUP BY a.id;

-- TRENDING: 直近7日間の追加・更新数
CREATE VIEW public.anime_trending AS
SELECT
    a.id          AS anime_id,
    COUNT(ual.user_id) AS recent_count
FROM public.anime a
LEFT JOIN public.user_anime_list ual
    ON ual.anime_id = a.id
    AND ual.updated_at > now() - interval '7 days'
GROUP BY a.id;

-- TOP_RATED: スコアをつけたユーザーの平均評価
CREATE VIEW public.anime_top_rated AS
SELECT
    a.id          AS anime_id,
    AVG(ual.score) AS avg_score,
    COUNT(ual.score) AS score_count
FROM public.anime a
LEFT JOIN public.user_anime_list ual
    ON ual.anime_id = a.id
    AND ual.score IS NOT NULL
GROUP BY a.id;
