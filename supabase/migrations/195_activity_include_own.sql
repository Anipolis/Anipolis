-- ============================================================
-- 195_activity_include_own: タイムラインの「アクティビティ」に自分の記録も出す
-- ============================================================
-- これまでは、フォロー中の人の記録だけを読んでいた（181）。自分の記録も並べると、いいねの通知が来たとき
-- どの記録への反応かをタブの中で確かめられ、「全体」のタイムラインに自分の投稿が並ぶのとも揃う。
--
-- 方針:
--   * フォロー中の人の記録と自分の記録を、それぞれ新しい順に上限まで読んでから合わせ、もう一度並べて切る
--     （どちらも mylist_activities の (user_id, created_at) の索引に乗る）
--   * 自分はフォローできない（009 の no_self_follow）ので重複はしないが、念のためフォロー側から自分を除く
--   * 見える範囲は今までどおり記録の RLS が決める（SECURITY DEFINER にしない）

CREATE OR REPLACE FUNCTION public.get_following_activity(
    p_limit integer DEFAULT 50,
    p_before timestamptz DEFAULT NULL,
    p_before_id uuid DEFAULT NULL
)
RETURNS TABLE (activity_id uuid, created_at timestamptz)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    WITH params AS (
        SELECT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100) AS lim
    ),
    following AS (
        SELECT a.id, a.created_at
        FROM public.follows f
        JOIN public.mylist_activities a ON a.user_id = f.following_id
        WHERE f.follower_id = auth.uid()
          AND f.following_id <> auth.uid()
          AND (
              p_before IS NULL
              OR a.created_at < p_before
              OR (p_before_id IS NOT NULL AND a.created_at = p_before AND a.id < p_before_id)
          )
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT (SELECT lim FROM params)
    ),
    own AS (
        SELECT a.id, a.created_at
        FROM public.mylist_activities a
        WHERE a.user_id = auth.uid()
          AND (
              p_before IS NULL
              OR a.created_at < p_before
              OR (p_before_id IS NOT NULL AND a.created_at = p_before AND a.id < p_before_id)
          )
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT (SELECT lim FROM params)
    )
    SELECT id, created_at
    FROM (SELECT * FROM following UNION ALL SELECT * FROM own) merged
    ORDER BY created_at DESC, id DESC
    LIMIT (SELECT lim FROM params);
$$;

REVOKE ALL ON FUNCTION public.get_following_activity(integer, timestamptz, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_following_activity(integer, timestamptz, uuid) TO authenticated;
