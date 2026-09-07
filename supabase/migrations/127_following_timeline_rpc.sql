-- ============================================================
-- 127_following_timeline_rpc: フォロー中タイムラインをDB内で結合する
-- ============================================================
-- フォローIDをアプリケーションへ全件展開し、PostgREST の巨大な IN 条件に
-- 戻す方式を廃止する。投稿とリポストを時系列で統合した軽量なイベント列だけを
-- 返し、投稿本体の水和は呼び出し側で最大 p_limit 件に限定して行う。
--
-- SECURITY INVOKER により posts / reposts の既存 RLS をそのまま適用する。
-- 対象ユーザーは auth.uid() からのみ決めるため、引数の差し替えによって他人の
-- フォロー中タイムラインを取得することはできない。

CREATE OR REPLACE FUNCTION public.get_following_timeline(
    p_limit integer DEFAULT 50,
    p_before timestamptz DEFAULT NULL,
    p_before_id uuid DEFAULT NULL
)
RETURNS TABLE (
    post_id uuid,
    timeline_created_at timestamptz,
    repost_user_id uuid,
    reposted_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    WITH events AS (
        -- フォロー中ユーザー自身のトップレベル投稿
        SELECT
            p.id AS post_id,
            p.created_at AS timeline_created_at,
            NULL::uuid AS repost_user_id,
            NULL::timestamptz AS reposted_at,
            0 AS event_kind
        FROM public.follows f
        JOIN public.posts p ON p.user_id = f.following_id
        WHERE f.follower_id = auth.uid()
          AND p.parent_id IS NULL

        UNION ALL

        -- フォロー中ユーザーによるリポスト。対象投稿の RLS は reposts の既存
        -- select policy により検証されるため、閲覧不能な投稿IDは返らない。
        SELECT
            r.post_id,
            r.created_at AS timeline_created_at,
            r.user_id AS repost_user_id,
            r.created_at AS reposted_at,
            1 AS event_kind
        FROM public.follows f
        JOIN public.reposts r ON r.user_id = f.following_id
        WHERE f.follower_id = auth.uid()
    ),
    deduplicated AS (
        -- 同じ投稿を複数のフォロー中ユーザーがリポストしていても、最も新しい
        -- イベントだけを残す。投稿と同時刻なら従来のクライアント側処理と同じく
        -- 投稿本体を優先する。
        SELECT DISTINCT ON (post_id)
            post_id,
            timeline_created_at,
            repost_user_id,
            reposted_at
        FROM events
        ORDER BY post_id, timeline_created_at DESC, event_kind ASC
    )
    SELECT
        post_id,
        timeline_created_at,
        repost_user_id,
        reposted_at
    FROM deduplicated
    -- 重複を除外した後でカーソルを適用する。先のページに出た投稿の古い
    -- リポストイベントを後続ページへ再登場させないための順序である。
    WHERE p_before IS NULL
       OR timeline_created_at < p_before
       OR (
            p_before_id IS NOT NULL
            AND timeline_created_at = p_before
            AND post_id < p_before_id
       )
    ORDER BY timeline_created_at DESC, post_id DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
$$;

-- follows(follower_id) と既存の posts_user_created_idx を利用して対象投稿を
-- 絞り込む。リポスト側にも同じアクセスパターン用の複合インデックスを追加する。
CREATE INDEX CONCURRENTLY IF NOT EXISTS reposts_user_created_idx
    ON public.reposts (user_id, created_at DESC, post_id DESC);

REVOKE ALL ON FUNCTION public.get_following_timeline(integer, timestamptz, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_following_timeline(integer, timestamptz, uuid) TO authenticated;
