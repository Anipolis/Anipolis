-- Post-level moderation: admins can hide or delete any post.

ALTER TABLE public.posts
    ADD COLUMN IF NOT EXISTS hidden_by_admin boolean NOT NULL DEFAULT false;

-- ── SELECT policy: hide admin-hidden posts from regular users ───────────────
DO $$
DECLARE policy_name text;
BEGIN
    FOR policy_name IN
        SELECT polname FROM pg_policy
        WHERE polrelid = 'public.posts'::regclass AND polcmd = 'r'
    LOOP
        EXECUTE format('DROP POLICY %I ON public.posts', policy_name);
    END LOOP;
END $$;

CREATE POLICY "posts: visible to public or followers, not hidden by admin"
    ON public.posts FOR SELECT
    USING (
        public.can_view_profile_content(user_id)
        AND (NOT hidden_by_admin OR public.is_current_user_admin())
    );

-- ── DELETE policy: owner or admin ──────────────────────────────────────────
DO $$
DECLARE policy_name text;
BEGIN
    FOR policy_name IN
        SELECT polname FROM pg_policy
        WHERE polrelid = 'public.posts'::regclass AND polcmd = 'd'
    LOOP
        EXECUTE format('DROP POLICY %I ON public.posts', policy_name);
    END LOOP;
END $$;

CREATE POLICY "posts: owner or admin can delete"
    ON public.posts FOR DELETE
    USING (auth.uid() = user_id OR public.is_current_user_admin());

-- ── UPDATE policy: only admins (for hidden_by_admin flag) ─────────────────
CREATE POLICY "posts: admin can update"
    ON public.posts FOR UPDATE
    USING (public.is_current_user_admin())
    WITH CHECK (public.is_current_user_admin());
