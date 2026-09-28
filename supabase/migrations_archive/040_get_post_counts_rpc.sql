-- ============================================================
-- get_post_counts: 投稿IDリストに対するカウントをバッチで返すRPC
-- ============================================================
-- 目的:
--   enrichPostsWithCounts() が likes/reposts/replies/bookmarks テーブルから
--   全行を取得してNode.js側でカウントしていた実装を置き換える。
--   全行転送ではなくDB側でGROUP BY集計し、結果のみを返すことで
--   データ転送量を大幅削減する。
--
-- 引数:
--   p_post_ids  : カウント対象の投稿IDリスト
--   p_user_id   : ログイン中ユーザーのID（NULLの場合はliked/reposted/bookmarked は全てfalse）
--
-- セキュリティ:
--   SECURITY DEFINER のため RLS をバイパスする。user_likes/user_reposts/user_bookmarks
--   各CTEに AND p_user_id = auth.uid() を追加することで、呼び出し元が自分以外の
--   UUID を p_user_id に渡しても *_by_me が常に false になるよう防御している。
--   （NULL = auth.uid() は NULL であり偽になるため、未ログイン時も安全）
--
-- 返り値（1行 = 1投稿）:
--   post_id, like_count, repost_count, reply_count,
--   liked_by_me, reposted_by_me, bookmarked_by_me
-- ============================================================

CREATE OR REPLACE FUNCTION get_post_counts(
    p_post_ids  uuid[],
    p_user_id   uuid DEFAULT NULL
)
RETURNS TABLE(
    post_id         uuid,
    like_count      bigint,
    repost_count    bigint,
    reply_count     bigint,
    liked_by_me     boolean,
    reposted_by_me  boolean,
    bookmarked_by_me boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH ids AS (
        SELECT unnest(p_post_ids) AS id
    ),
    like_counts AS (
        SELECT post_id, COUNT(*) AS cnt
        FROM likes
        WHERE post_id = ANY(p_post_ids)
        GROUP BY post_id
    ),
    repost_counts AS (
        SELECT post_id, COUNT(*) AS cnt
        FROM reposts
        WHERE post_id = ANY(p_post_ids)
        GROUP BY post_id
    ),
    reply_counts AS (
        SELECT parent_id, COUNT(*) AS cnt
        FROM posts
        WHERE parent_id = ANY(p_post_ids)
        GROUP BY parent_id
    ),
    user_likes AS (
        SELECT post_id
        FROM likes
        WHERE user_id = p_user_id
          AND post_id = ANY(p_post_ids)
          AND p_user_id = auth.uid()
    ),
    user_reposts AS (
        SELECT post_id
        FROM reposts
        WHERE user_id = p_user_id
          AND post_id = ANY(p_post_ids)
          AND p_user_id = auth.uid()
    ),
    user_bookmarks AS (
        SELECT post_id
        FROM bookmarks
        WHERE user_id = p_user_id
          AND post_id = ANY(p_post_ids)
          AND p_user_id = auth.uid()
    )
    SELECT
        ids.id                          AS post_id,
        COALESCE(lc.cnt,  0)           AS like_count,
        COALESCE(rc.cnt,  0)           AS repost_count,
        COALESCE(rpc.cnt, 0)           AS reply_count,
        (ul.post_id  IS NOT NULL)      AS liked_by_me,
        (ur.post_id  IS NOT NULL)      AS reposted_by_me,
        (ub.post_id  IS NOT NULL)      AS bookmarked_by_me
    FROM ids
    LEFT JOIN like_counts    lc  ON lc.post_id   = ids.id
    LEFT JOIN repost_counts  rc  ON rc.post_id   = ids.id
    LEFT JOIN reply_counts   rpc ON rpc.parent_id = ids.id
    LEFT JOIN user_likes     ul  ON ul.post_id   = ids.id
    LEFT JOIN user_reposts   ur  ON ur.post_id   = ids.id
    LEFT JOIN user_bookmarks ub  ON ub.post_id   = ids.id;
$$;

-- anon（未ログイン）・authenticated（ログイン済み）両ロールに実行権限を付与
GRANT EXECUTE ON FUNCTION get_post_counts(uuid[], uuid) TO anon, authenticated;
