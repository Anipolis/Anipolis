-- ================================================================
-- 200_reposts_select_visible_reposter.sql
-- リポストは、リポストした人のプロフィールを読める人だけが読めるようにする。
--
-- reposts の SELECT（062）は「元の投稿を読めるか」だけを見ていた。鍵アカウントの人が
-- 公開の投稿をリポストすると、フォロワーでない人にも「誰がいつリポストしたか」が読めた
-- （タイムラインの「〇〇さんがリポスト」、リポストした人の一覧、REST API の直接の読み取り）。
--
-- 062 の条件に、リポストした人についての can_view_profile_content を足す
-- （鍵アカウントはフォロワーと本人だけ、BAN・ブロックの相手は読めない）。
-- 本人のリポストは本人がいつでも読める（解除の前の照会が通る）。
-- リポストの数（get_post_counts）は SECURITY DEFINER で数えるので変わらない。
--
-- リポストした人の一覧（get_post_reaction_users）は SECURITY DEFINER でポリシーを通らないので、
-- 同じ条件を関数にも足す。いいねの一覧は投稿者本人しか読めないので、そのまま。
-- 141 の定義 + リポストした人の可視性。
-- ================================================================

DO $$
DECLARE
    policy_name text;
BEGIN
    FOR policy_name IN
        SELECT polname
        FROM pg_policy
        WHERE polrelid = 'public.reposts'::regclass
          AND polcmd = 'r'
    LOOP
        EXECUTE format('DROP POLICY %I ON public.reposts', policy_name);
    END LOOP;
END $$;

CREATE POLICY "reposts_select_visible_posts"
    ON public.reposts FOR SELECT
    USING (
        public.can_view_profile_content(user_id)
        AND EXISTS (
            SELECT 1
            FROM public.posts p
            WHERE p.id = post_id
              AND public.can_view_profile_content(p.user_id)
              AND (NOT p.hidden_by_admin OR public.is_current_user_admin())
        )
    );

CREATE OR REPLACE FUNCTION public.get_post_reaction_users(
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
    IF action_type IS NULL OR action_type NOT IN ('like', 'repost') THEN
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

    IF action_type = 'like'
       AND (auth.uid() IS NULL OR post_author_id IS DISTINCT FROM auth.uid()) THEN
        RETURN;
    END IF;

    IF action_type = 'like' THEN
        RETURN QUERY
        SELECT l.user_id, p.username, p.display_name, p.avatar_url, l.created_at
        FROM public.likes l
        JOIN public.profiles p ON p.id = l.user_id
        WHERE l.post_id = target_post_id
          AND NOT public.is_blocked_between(auth.uid(), l.user_id)
        ORDER BY l.created_at DESC
        LIMIT effective_limit OFFSET effective_offset;
    ELSE
        RETURN QUERY
        SELECT r.user_id, p.username, p.display_name, p.avatar_url, r.created_at
        FROM public.reposts r
        JOIN public.profiles p ON p.id = r.user_id
        WHERE r.post_id = target_post_id
          AND NOT public.is_blocked_between(auth.uid(), r.user_id)
          AND public.can_view_profile_content(r.user_id)
        ORDER BY r.created_at DESC
        LIMIT effective_limit OFFSET effective_offset;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_post_reaction_users(uuid, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_post_reaction_users(uuid, text, integer, integer) TO anon, authenticated, service_role;
