-- ランキングビューは公開中のマイリストだけを数える。
--
-- 119 の SELECT ポリシーは「本人 OR 公開リスト」なので、security_invoker のビューでは
-- 本人が見るときだけ自分の非公開リストも集計に入っていた。
-- 「非公開のマイリストはスコアやランキングに数えない」という説明どおりにするため、
-- list_is_public を明示的に絞る。鍵アカウントの公開リストは、これまでどおり
-- 閲覧できるフォロワーの集計にだけ入る（ポリシー側の判定）。
-- 列は変えないので、依存するビュー（anime_list_sortable など）は作り直さなくてよい。

CREATE OR REPLACE VIEW public.anime_popularity
WITH (security_invoker = true) AS
SELECT
    a.id AS anime_id,
    COUNT(ual.anime_id) AS list_count
FROM public.anime a
LEFT JOIN public.user_anime_list ual
    ON ual.anime_id = a.id
    AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = ual.user_id AND p.list_is_public = true
    )
WHERE a.metadata_ready
    AND (NOT a.hidden_by_admin OR public.is_current_user_admin())
GROUP BY a.id;

CREATE OR REPLACE VIEW public.anime_trending
WITH (security_invoker = true) AS
SELECT
    a.id AS anime_id,
    COUNT(ual.anime_id) AS recent_count
FROM public.anime a
LEFT JOIN public.user_anime_list ual
    ON ual.anime_id = a.id
    AND ual.updated_at >= now() - interval '7 days'
    AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = ual.user_id AND p.list_is_public = true
    )
WHERE a.metadata_ready
    AND (NOT a.hidden_by_admin OR public.is_current_user_admin())
GROUP BY a.id;

CREATE OR REPLACE VIEW public.anime_top_rated
WITH (security_invoker = true) AS
SELECT
    a.id AS anime_id,
    COALESCE(AVG(ual.score) FILTER (WHERE ual.score IS NOT NULL), 0) AS avg_score,
    COUNT(ual.score) FILTER (WHERE ual.score IS NOT NULL) AS score_count
FROM public.anime a
LEFT JOIN public.user_anime_list ual
    ON ual.anime_id = a.id
    AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = ual.user_id AND p.list_is_public = true
    )
WHERE a.metadata_ready
    AND (NOT a.hidden_by_admin OR public.is_current_user_admin())
GROUP BY a.id;
