-- Add private account support. Private users' posts are visible only to
-- themselves and their followers.

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS is_private boolean DEFAULT false NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_is_private
    ON public.profiles (is_private);

CREATE OR REPLACE FUNCTION public.can_view_profile_content(profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT
        profile_id = auth.uid()
        OR EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE p.id = profile_id
              AND p.is_private = false
        )
        OR EXISTS (
            SELECT 1
            FROM public.follows f
            WHERE f.follower_id = auth.uid()
              AND f.following_id = profile_id
        );
$$;

DO $$
DECLARE
    policy_name text;
BEGIN
    FOR policy_name IN
        SELECT polname
        FROM pg_policy
        WHERE polrelid = 'public.posts'::regclass
          AND polcmd = 'r'
    LOOP
        EXECUTE format('DROP POLICY %I ON public.posts', policy_name);
    END LOOP;
END $$;

CREATE POLICY "posts: visible to public or followers"
    ON public.posts FOR SELECT
    USING (public.can_view_profile_content(user_id));

DO $$
DECLARE
    policy_name text;
BEGIN
    FOR policy_name IN
        SELECT polname
        FROM pg_policy
        WHERE polrelid = 'public.likes'::regclass
          AND polcmd = 'a'
    LOOP
        EXECUTE format('DROP POLICY %I ON public.likes', policy_name);
    END LOOP;
END $$;

CREATE POLICY "likes: authenticated users can like visible posts"
    ON public.likes FOR INSERT
    WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
            SELECT 1
            FROM public.posts p
            WHERE p.id = post_id
              AND public.can_view_profile_content(p.user_id)
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
          AND polcmd = 'a'
    LOOP
        EXECUTE format('DROP POLICY %I ON public.reposts', policy_name);
    END LOOP;
END $$;

CREATE POLICY "reposts: authenticated users can repost visible posts"
    ON public.reposts FOR INSERT
    WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
            SELECT 1
            FROM public.posts p
            WHERE p.id = post_id
              AND public.can_view_profile_content(p.user_id)
        )
    );
