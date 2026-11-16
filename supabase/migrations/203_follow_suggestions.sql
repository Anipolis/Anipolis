-- ============================================================
-- 203_follow_suggestions: フォローのおすすめ（共通の作品）
-- ============================================================
-- はじめての人に「ユーザーを探してフォロー」で空の検索画面を見せるだけだったのをやめ、
-- フォローボタン付きのおすすめを出す。理由は「共通の作品: 〇〇」。
--
-- 方針:
--   * 自分のマイリスト（見るのをやめた作品を除く、新しい順に最大 200 件）と同じ作品を登録している人を、
--     共通の作品が多い順・最近更新した順に並べる
--   * 共通の作品が足りないとき（マイリストが空の人など）は、最近 14 日によく投稿している人で埋める
--   * 自分・フォロー中・フォロー申請中・ミュート中の人は出さない
--   * 見える範囲は今までどおり RLS が決める（SECURITY DEFINER にしない）。
--     user_anime_list は 119 の「本人または公開リスト」（can_view_profile_content: 鍵・ブロック・BAN）、
--     posts も閲覧できる投稿だけになるので、非公開リスト・鍵アカウント・ブロック相手・BAN は候補に入らない
--   * 返す作品名は、自分が最近更新した作品から 2 件まで

CREATE OR REPLACE FUNCTION public.get_follow_suggestions(p_limit integer DEFAULT 5)
RETURNS TABLE (
    user_id uuid,
    username text,
    display_name text,
    avatar_url text,
    shared_count integer,
    shared_titles text[]
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    WITH params AS (
        SELECT LEAST(GREATEST(COALESCE(p_limit, 5), 1), 20) AS lim
    ),
    excluded AS (
        SELECT auth.uid() AS id
        UNION
        SELECT f.following_id FROM public.follows f WHERE f.follower_id = auth.uid()
        UNION
        SELECT r.target_id FROM public.follow_requests r WHERE r.requester_id = auth.uid()
        UNION
        SELECT m.muted_id FROM public.user_mutes m WHERE m.muter_id = auth.uid()
    ),
    mine AS (
        SELECT l.anime_id, l.updated_at
        FROM public.user_anime_list l
        WHERE l.user_id = auth.uid()
          AND l.status <> 'dropped'
        ORDER BY l.updated_at DESC
        LIMIT 200
    ),
    shared AS (
        SELECT
            l.user_id,
            count(*)::integer AS shared_count,
            max(l.updated_at) AS last_at,
            (array_agg(a.title ORDER BY m.updated_at DESC))[1:2] AS shared_titles
        FROM mine m
        JOIN public.user_anime_list l ON l.anime_id = m.anime_id
        JOIN public.anime a ON a.id = m.anime_id
        WHERE l.status <> 'dropped'
          AND l.user_id NOT IN (SELECT id FROM excluded WHERE id IS NOT NULL)
        GROUP BY l.user_id
        ORDER BY count(*) DESC, max(l.updated_at) DESC
        LIMIT (SELECT lim FROM params)
    ),
    active AS (
        SELECT p.user_id, count(*) AS post_count, max(p.created_at) AS last_at
        FROM public.posts p
        WHERE p.created_at > now() - interval '14 days'
          AND p.user_id NOT IN (SELECT id FROM excluded WHERE id IS NOT NULL)
          AND p.user_id NOT IN (SELECT s.user_id FROM shared s)
        GROUP BY p.user_id
        ORDER BY count(*) DESC, max(p.created_at) DESC
        LIMIT (SELECT lim FROM params)
    ),
    ranked AS (
        SELECT s.user_id, s.shared_count, s.shared_titles, 0 AS bucket, s.shared_count::bigint AS score, s.last_at
        FROM shared s
        UNION ALL
        SELECT a.user_id, 0, ARRAY[]::text[], 1, a.post_count, a.last_at
        FROM active a
    )
    SELECT r.user_id, pr.username, pr.display_name, pr.avatar_url, r.shared_count, r.shared_titles
    FROM ranked r
    JOIN public.profiles pr ON pr.id = r.user_id
    ORDER BY r.bucket, r.score DESC, r.last_at DESC
    LIMIT (SELECT lim FROM params);
$$;

REVOKE ALL ON FUNCTION public.get_follow_suggestions(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_follow_suggestions(integer) TO authenticated;
