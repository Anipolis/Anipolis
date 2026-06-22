-- Expose reaction user lists according to post ownership rules.
-- Likes identify users only to the post author; reposts remain visible when
-- the post itself is visible.

DO $$
DECLARE
    policy_name text;
BEGIN
    FOR policy_name IN
        SELECT polname
        FROM pg_policy
        WHERE polrelid = 'public.likes'::regclass
          AND polcmd = 'r'
    LOOP
        EXECUTE format('DROP POLICY %I ON public.likes', policy_name);
    END LOOP;
END $$;

CREATE POLICY "likes_select_self_or_post_author"
    ON public.likes FOR SELECT
    USING (
        auth.uid() = user_id
        OR EXISTS (
            SELECT 1
            FROM public.posts p
            WHERE p.id = post_id
              AND p.user_id = auth.uid()
              AND (NOT p.hidden_by_admin OR public.is_current_user_admin())
        )
    );

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
        EXISTS (
            SELECT 1
            FROM public.posts p
            WHERE p.id = post_id
              AND public.can_view_profile_content(p.user_id)
              AND (NOT p.hidden_by_admin OR public.is_current_user_admin())
        )
    );

CREATE OR REPLACE FUNCTION public.get_post_reaction_users(target_post_id uuid, action_type text)
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
        ORDER BY l.created_at DESC;
    ELSE
        RETURN QUERY
        SELECT r.user_id, p.username, p.display_name, p.avatar_url, r.created_at
        FROM public.reposts r
        JOIN public.profiles p ON p.id = r.user_id
        WHERE r.post_id = target_post_id
        ORDER BY r.created_at DESC;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_post_reaction_users(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_post_reaction_users(uuid, text) TO anon, authenticated;

-- Counts remain public for visible posts without disclosing like identities.
CREATE OR REPLACE FUNCTION public.get_post_engagement_counts(target_post_ids uuid[])
RETURNS TABLE (
    post_id uuid,
    like_count bigint,
    repost_count bigint,
    reply_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH target_posts AS (
        SELECT p.id AS post_id
        FROM public.posts p
        JOIN (SELECT DISTINCT unnest(target_post_ids) AS post_id) requested ON requested.post_id = p.id
        WHERE public.can_view_profile_content(p.user_id)
          AND (NOT p.hidden_by_admin OR public.is_current_user_admin())
    ),
    like_counts AS (
        SELECT likes.post_id, COUNT(*) AS like_count
        FROM public.likes
        JOIN target_posts ON target_posts.post_id = likes.post_id
        GROUP BY likes.post_id
    ),
    repost_counts AS (
        SELECT reposts.post_id, COUNT(*) AS repost_count
        FROM public.reposts
        JOIN target_posts ON target_posts.post_id = reposts.post_id
        GROUP BY reposts.post_id
    ),
    reply_counts AS (
        SELECT posts.parent_id AS post_id, COUNT(*) AS reply_count
        FROM public.posts
        JOIN target_posts ON target_posts.post_id = posts.parent_id
        WHERE public.can_view_profile_content(posts.user_id)
          AND (NOT posts.hidden_by_admin OR public.is_current_user_admin())
        GROUP BY posts.parent_id
    )
    SELECT
        target_posts.post_id,
        COALESCE(like_counts.like_count, 0),
        COALESCE(repost_counts.repost_count, 0),
        COALESCE(reply_counts.reply_count, 0)
    FROM target_posts
    LEFT JOIN like_counts USING (post_id)
    LEFT JOIN repost_counts USING (post_id)
    LEFT JOIN reply_counts USING (post_id);
$$;

REVOKE ALL ON FUNCTION public.get_post_engagement_counts(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_post_engagement_counts(uuid[]) TO anon, authenticated;
