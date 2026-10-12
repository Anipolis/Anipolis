-- ============================================================
-- 144_anime_list_sortable_view: アニメ一覧の並べ替えとページ分けを DB で行う（#322）
-- ============================================================
-- これまでの一覧は、条件に合う候補を created_at 順に取ってきてアプリ側で並べ替え・ページ分け
-- していた。PostgREST の max_rows（本番 1000）で候補が切れるため、「すべて」タブは閲覧できる
-- 約1.6万件のうち新しく登録された1000件しか扱えず、人気順＋絞り込みもその1000件の中だけで
-- 並べていた。
--
-- 並べ替えに使う値（シーズンの新旧・人気・話題・評価）を作品の列と並べたビューを用意し、
-- 絞り込み・並べ替え・ページ分け・件数を1回の問い合わせで DB にやらせる。
--   * 列は anime_with_computed_broadcast_status をそのまま引き継ぐので、既存の絞り込み
--     （applyAnimeListFilters）がそのまま使える。
--   * 集計は 101 のランキングビューを使う（毎回計算。security_invoker なので、マイリストの
--     公開範囲は見る人の権限で 119 の RLS が効く。既存のランキングと同じ数え方）。
--   * 使わない集計の JOIN は、各ビューが anime_id で一意なので planner が取り除ける。

CREATE OR REPLACE VIEW public.anime_list_sortable
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
