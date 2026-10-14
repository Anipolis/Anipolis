-- ============================================================
-- 145_anime_list_genre_match: 複数ジャンル選択時の一致数を DB の並べ替えに使う（#322, PR #370 レビュー）
-- ============================================================
-- ジャンルの絞り込みは「同じ種類（ジャンル/テーマ/対象層）のタグは OR、種類をまたぐと AND」
-- （src/lib/anime-vocabulary.ts の groupGenreFilters）。同じ種類のタグを複数選ぶと、片方だけに
-- 当てはまる作品も結果に残るので、選んだタグに多く当てはまる作品を先に並べる必要がある。
-- 144 で並べ替えを DB に移した際、この一致数による並びが抜けていた。
--
-- 一致数は選んだタグ（引数）で決まるのでビューの列にはできない。引数を受け取る集合関数にし、
-- PostgREST の RPC に対して絞り込み・並べ替え・range をかける。
--   * 戻り値の型には、144 のビューに genre_match を足しただけのビューを使う（列の並びを一致させるため）。
--   * 関数は SQL・STABLE・SECURITY INVOKER で SET 句を付けない。これらを満たす集合関数は
--     planner が呼び出し元の問い合わせに展開（inline）するので、PostgREST の WHERE / ORDER BY /
--     LIMIT が中まで効き、全行を作ってから絞ることにならない。SET search_path を付けると展開されない
--     ため、代わりに参照はすべて public. で修飾する。
--   * 一致の判定はアプリの countGenreMatches と同じ（genre と genre_en を小文字で比べ、選んだタグの数を数える）。
--   * 引数は先頭20件だけ使う（UI で選べる数より十分多い。巨大な配列で行ごとの計算を重くさせないため）。

CREATE OR REPLACE VIEW public.anime_list_genre_ranked
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
