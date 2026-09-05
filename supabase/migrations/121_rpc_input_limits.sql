-- 公開 RPC の入力・出力上限と可視性検査を追加する（Codex監査 P1-4 / P1-5）。
--
-- 1) get_post_counts: 任意長の UUID 配列を受け取り、SECURITY DEFINER で
--    RLS を迂回して集計していた。配列長を 200 件に制限し、呼び出し元が
--    閲覧できる投稿（can_view_profile_content + 管理者非表示でない）だけを
--    集計対象にする。
-- 2) get_post_reaction_users: ページングなしで反応者全件を返していた。
--    limit/offset 引数（上限 100 件）を追加する。既存クライアントは
--    既定値で動作する（Supabase RPC は名前付き引数のため互換）。
-- 3) posts.image_urls: 4枚制限がクライアントにしかなかったため、
--    DB 制約（NOT VALID: 新規行にのみ適用）を追加する。

-- ----------------------------------------------------------------
-- 1. get_post_counts の強化（シグネチャ不変・実装を plpgsql 化）
-- ----------------------------------------------------------------
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
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF coalesce(cardinality(p_post_ids), 0) > 200 THEN
        RAISE EXCEPTION 'too many post ids (max 200)';
    END IF;

    RETURN QUERY
    WITH ids AS (
        -- 呼び出し元が閲覧できる投稿だけを集計対象にする
        SELECT DISTINCT p.id
        FROM public.posts p
        WHERE p.id = ANY(p_post_ids)
          AND public.can_view_profile_content(p.user_id)
          AND (NOT p.hidden_by_admin OR public.is_current_user_admin())
    ),
    like_counts AS (
        SELECT l.post_id, COUNT(*) AS cnt
        FROM likes l
        JOIN ids ON ids.id = l.post_id
        GROUP BY l.post_id
    ),
    repost_counts AS (
        SELECT r.post_id, COUNT(*) AS cnt
        FROM reposts r
        JOIN ids ON ids.id = r.post_id
        GROUP BY r.post_id
    ),
    reply_counts AS (
        SELECT po.parent_id, COUNT(*) AS cnt
        FROM posts po
        JOIN ids ON ids.id = po.parent_id
        GROUP BY po.parent_id
    ),
    user_likes AS (
        SELECT l.post_id
        FROM likes l
        JOIN ids ON ids.id = l.post_id
        WHERE l.user_id = p_user_id
          AND p_user_id = auth.uid()
    ),
    user_reposts AS (
        SELECT r.post_id
        FROM reposts r
        JOIN ids ON ids.id = r.post_id
        WHERE r.user_id = p_user_id
          AND p_user_id = auth.uid()
    ),
    user_bookmarks AS (
        SELECT b.post_id
        FROM bookmarks b
        JOIN ids ON ids.id = b.post_id
        WHERE b.user_id = p_user_id
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
END;
$$;

REVOKE ALL ON FUNCTION get_post_counts(uuid[], uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_post_counts(uuid[], uuid) TO anon, authenticated, service_role;

-- ----------------------------------------------------------------
-- 2. get_post_reaction_users に limit/offset を追加
--    （引数が増えるため DROP して作り直す）
-- ----------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_post_reaction_users(uuid, text);

CREATE FUNCTION public.get_post_reaction_users(
    target_post_id uuid,
    action_type text,
    p_limit integer DEFAULT 100,
    p_offset integer DEFAULT 0
)
RETURNS TABLE (
    user_id uuid,
    username text,
    display_name text,
    avatar_url text,
    reacted_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    post_author_id uuid;
    effective_limit integer := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 100);
    effective_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
    IF action_type NOT IN ('like', 'repost') THEN
        RAISE EXCEPTION 'invalid reaction type';
    END IF;

    SELECT p.user_id INTO post_author_id
    FROM public.posts p
    WHERE p.id = target_post_id
      AND public.can_view_profile_content(p.user_id)
      AND (NOT p.hidden_by_admin OR public.is_current_user_admin());

    IF post_author_id IS NULL THEN
        RETURN;
    END IF;

    IF action_type = 'like' AND post_author_id != auth.uid() THEN
        RETURN;
    END IF;

    IF action_type = 'like' THEN
        RETURN QUERY
        SELECT l.user_id, p.username, p.display_name, p.avatar_url, l.created_at
        FROM public.likes l
        JOIN public.profiles p ON p.id = l.user_id
        WHERE l.post_id = target_post_id
        ORDER BY l.created_at DESC
        LIMIT effective_limit OFFSET effective_offset;
    ELSE
        RETURN QUERY
        SELECT r.user_id, p.username, p.display_name, p.avatar_url, r.created_at
        FROM public.reposts r
        JOIN public.profiles p ON p.id = r.user_id
        WHERE r.post_id = target_post_id
        ORDER BY r.created_at DESC
        LIMIT effective_limit OFFSET effective_offset;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_post_reaction_users(uuid, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_post_reaction_users(uuid, text, integer, integer) TO anon, authenticated, service_role;

-- ----------------------------------------------------------------
-- 3. posts.image_urls の枚数上限（新規行のみ）
-- ----------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'posts_image_urls_max_4'
          AND conrelid = 'public.posts'::regclass
    ) THEN
        ALTER TABLE public.posts
            ADD CONSTRAINT posts_image_urls_max_4
            CHECK (cardinality(image_urls) <= 4) NOT VALID;
    END IF;
END $$;
