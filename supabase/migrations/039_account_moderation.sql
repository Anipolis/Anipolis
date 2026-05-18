-- Account moderation controls for reports: restrict and ban users.
-- Keep moderation state outside profiles so this migration does not need to
-- create policies/triggers on an existing table with a different owner.

CREATE TABLE IF NOT EXISTS public.account_moderation (
    user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'restricted', 'banned')),
    restricted_until timestamptz,
    reason text,
    moderated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    moderated_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS account_moderation_status_idx
    ON public.account_moderation (status, restricted_until);

CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.is_admin = true
    );
$$;

CREATE OR REPLACE FUNCTION public.touch_account_moderation_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS account_moderation_touch_updated_at ON public.account_moderation;
CREATE TRIGGER account_moderation_touch_updated_at
    BEFORE UPDATE ON public.account_moderation
    FOR EACH ROW
    EXECUTE FUNCTION public.touch_account_moderation_updated_at();

ALTER TABLE public.account_moderation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "account_moderation_select_own_or_admin" ON public.account_moderation
    FOR SELECT USING (
        auth.uid() = user_id
        OR public.is_current_user_admin()
    );

CREATE POLICY "account_moderation_insert_admin" ON public.account_moderation
    FOR INSERT WITH CHECK (public.is_current_user_admin());

CREATE POLICY "account_moderation_update_admin" ON public.account_moderation
    FOR UPDATE USING (public.is_current_user_admin())
    WITH CHECK (public.is_current_user_admin());

CREATE OR REPLACE FUNCTION public.is_profile_active_for_writes(profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(
        (
            SELECT
                am.status = 'active'
                OR (
                    am.status = 'restricted'
                    AND am.restricted_until IS NOT NULL
                    AND am.restricted_until <= now()
                )
            FROM public.account_moderation am
            WHERE am.user_id = profile_id
        ),
        true
    );
$$;

CREATE OR REPLACE FUNCTION public.can_view_profile_content(profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT
        (
            COALESCE(
                (
                    SELECT am.status != 'banned'
                    FROM public.account_moderation am
                    WHERE am.user_id = profile_id
                ),
                true
            )
            OR public.is_current_user_admin()
            OR profile_id = auth.uid()
        )
        AND (
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
            )
            OR public.is_current_user_admin()
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
          AND polcmd = 'a'
    LOOP
        EXECUTE format('DROP POLICY %I ON public.posts', policy_name);
    END LOOP;
END $$;

CREATE POLICY "posts_insert_active_users"
    ON public.posts FOR INSERT
    WITH CHECK (
        auth.uid() = user_id
        AND public.is_profile_active_for_writes(user_id)
    );

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

CREATE POLICY "likes_insert_active_users"
    ON public.likes FOR INSERT
    WITH CHECK (
        auth.uid() = user_id
        AND public.is_profile_active_for_writes(user_id)
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

CREATE POLICY "reposts_insert_active_users"
    ON public.reposts FOR INSERT
    WITH CHECK (
        auth.uid() = user_id
        AND public.is_profile_active_for_writes(user_id)
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
        WHERE polrelid = 'public.follows'::regclass
          AND polcmd = 'a'
    LOOP
        EXECUTE format('DROP POLICY %I ON public.follows', policy_name);
    END LOOP;
END $$;

CREATE POLICY "follows_insert_active_users"
    ON public.follows FOR INSERT
    WITH CHECK (
        (
            auth.uid() = follower_id
            OR (
                auth.uid() = following_id
                AND EXISTS (
                    SELECT 1
                    FROM public.follow_requests fr
                    WHERE fr.requester_id = follower_id
                      AND fr.target_id = following_id
                      AND fr.status = 'pending'
                )
            )
        )
        AND public.is_profile_active_for_writes(follower_id)
    );

DO $$
DECLARE
    policy_name text;
BEGIN
    FOR policy_name IN
        SELECT polname
        FROM pg_policy
        WHERE polrelid = 'public.follow_requests'::regclass
          AND polcmd = 'a'
    LOOP
        EXECUTE format('DROP POLICY %I ON public.follow_requests', policy_name);
    END LOOP;
END $$;

CREATE POLICY "follow_requests_insert_active_users" ON public.follow_requests
    FOR INSERT WITH CHECK (
        auth.uid() = requester_id
        AND public.is_profile_active_for_writes(requester_id)
        AND EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE p.id = target_id
              AND p.is_private = true
        )
        AND NOT EXISTS (
            SELECT 1
            FROM public.follows f
            WHERE f.follower_id = requester_id
              AND f.following_id = target_id
        )
    );

DO $$
DECLARE
    policy_name text;
BEGIN
    IF to_regclass('public.bookmarks') IS NOT NULL THEN
        FOR policy_name IN
            SELECT polname
            FROM pg_policy
            WHERE polrelid = 'public.bookmarks'::regclass
              AND polcmd = 'a'
        LOOP
            EXECUTE format('DROP POLICY %I ON public.bookmarks', policy_name);
        END LOOP;

        EXECUTE $policy$
            CREATE POLICY "bookmarks_insert_active_users" ON public.bookmarks
                FOR INSERT WITH CHECK (
                    auth.uid() = user_id
                    AND public.is_profile_active_for_writes(user_id)
                )
        $policy$;
    END IF;
END $$;
