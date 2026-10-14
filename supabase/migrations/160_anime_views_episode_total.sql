-- ============================================================
-- 160_anime_views_episode_total: anime を * で引き継ぐビューを作り直し、episode_total を含める（#354）
-- ============================================================
-- 152 で anime に episode_total（整数の話数）を足したが、anime.* を展開したビューは作成時点の列で
-- 固定されるため、ビューからは読めなかった（scripts/check-anime-view-types.ts の除外で凌いでいた）。
-- 新しい列は anime.* の途中に入るので CREATE OR REPLACE では作り直せない。依存する順に消して、
-- 定義を変えずに作り直す（136 / 144 / 145 と同一）。
--   * CASCADE は使わない。想定外の依存（ダッシュボードで作ったビューなど）があれば、黙って消さずに
--     この migration を失敗させる
--   * episode_count（文字列）は残す。読み書きを episode_total に移し終えてから消す（master のリリース後）

DROP FUNCTION public.anime_list_with_genre_match(text[]);
DROP VIEW public.anime_list_genre_ranked;
DROP VIEW public.anime_list_sortable;
DROP VIEW public.anime_with_computed_broadcast_status;

CREATE VIEW public.anime_with_computed_broadcast_status
WITH (security_invoker = true) AS
SELECT
    anime.*,
    CASE
        -- Explicit dates drive automatic upcoming -> airing -> finished transitions.
        WHEN aired_from IS NOT NULL AND aired_from > (now() AT TIME ZONE 'Asia/Tokyo')::date
            THEN 'upcoming'
        WHEN aired_to IS NOT NULL AND aired_to < (now() AT TIME ZONE 'Asia/Tokyo')::date
            THEN 'finished'
        WHEN aired_from IS NOT NULL
            AND aired_from <= (now() AT TIME ZONE 'Asia/Tokyo')::date
            AND aired_to IS NOT NULL
            AND aired_to >= (now() AT TIME ZONE 'Asia/Tokyo')::date
            THEN 'airing'
        -- One-shot and finite release formats finish once their release date arrives.
        WHEN aired_to IS NULL
            AND (
                regexp_replace(lower(coalesce(type, '')), '[^a-z0-9]', '', 'g')
                    IN ('movie', 'ona', 'ova', 'tvspecial', 'special')
                OR btrim(coalesce(type, '')) IN ('映画', '特別')
            )
            AND (
                (aired_from IS NOT NULL
                    AND aired_from <= (now() AT TIME ZONE 'Asia/Tokyo')::date)
                OR status = 'airing'
            )
            THEN 'finished'
        -- Source status fills gaps such as historical TV entries without aired_to.
        WHEN status = 'finished'
            THEN 'finished'
        WHEN aired_from IS NOT NULL
            AND aired_from <= (now() AT TIME ZONE 'Asia/Tokyo')::date
            AND aired_to IS NULL
            THEN 'airing'
        WHEN status = 'upcoming'
            THEN 'upcoming'
        WHEN status = 'airing'
            THEN 'airing'
        ELSE 'unknown'
    END AS computed_broadcast_status
FROM public.anime;

GRANT SELECT ON public.anime_with_computed_broadcast_status TO anon, authenticated;

CREATE VIEW public.anime_list_sortable
WITH (security_invoker = true) AS
SELECT
    v.*,
    -- "2026-fall" 形式のシーズンを新旧比較できる数値にする（年×4＋季節）。形式外は NULL（最後へ）。
    -- 文字のまま並べると winter/spring/summer/fall の順が崩れるため。
    CASE
        WHEN v.season ~ '^[0-9]{4}-(winter|spring|summer|fall)$' THEN
            split_part(v.season, '-', 1)::integer * 4
            + CASE split_part(v.season, '-', 2)
                WHEN 'winter' THEN 0
                WHEN 'spring' THEN 1
                WHEN 'summer' THEN 2
                ELSE 3
              END
    END AS season_sort_key,
    COALESCE(p.list_count, 0) AS list_count,
    COALESCE(t.recent_count, 0) AS recent_count,
    COALESCE(r.avg_score, 0) AS avg_score,
    COALESCE(r.score_count, 0) AS score_count,
    -- 評価順の主キー。評価が1件も無い作品は 0 扱い（アプリの normalizeAverageScore と同じ）
    CASE
        WHEN COALESCE(r.score_count, 0) > 0 AND r.avg_score > 0 THEN r.avg_score
        ELSE 0
    END AS rating_sort_score
FROM public.anime_with_computed_broadcast_status v
LEFT JOIN public.anime_popularity p ON p.anime_id = v.id
LEFT JOIN public.anime_trending t ON t.anime_id = v.id
LEFT JOIN public.anime_top_rated r ON r.anime_id = v.id;

GRANT SELECT ON public.anime_list_sortable TO anon, authenticated;

CREATE VIEW public.anime_list_genre_ranked
WITH (security_invoker = true) AS
SELECT
    s.*,
    0::integer AS genre_match
FROM public.anime_list_sortable s;

CREATE OR REPLACE FUNCTION public.anime_list_with_genre_match(p_genres text[])
RETURNS SETOF public.anime_list_genre_ranked
LANGUAGE sql
STABLE
AS $$
    SELECT
        s.*,
        (
            SELECT count(*)::integer
            FROM unnest(p_genres[1:20]) AS selected(name)
            WHERE lower(selected.name) IN (
                SELECT lower(tag)
                FROM unnest(COALESCE(s.genre, '{}'::text[]) || COALESCE(s.genre_en, '{}'::text[])) AS tag
            )
        ) AS genre_match
    FROM public.anime_list_sortable s;
$$;

REVOKE ALL ON FUNCTION public.anime_list_with_genre_match(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.anime_list_with_genre_match(text[]) TO anon, authenticated, service_role;
