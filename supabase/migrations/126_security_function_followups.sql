-- Security follow-ups for functions introduced by earlier migrations.
--
-- Keep this in a new migration: 110 and 121 may already be present in a
-- remote database, so their applied files must remain immutable.

-- SECURITY DEFINER functions must not resolve unqualified names through a
-- caller-controlled search_path.  Unread mylist notifications use a partial
-- unique index so the database, rather than a caller-side check, owns the
-- duplicate guarantee.

-- Remove duplicates created by the old trigger before adding the constraint.
-- Keep the oldest notification for each unread recipient/actor/anime/status
-- tuple so the original notification timestamp remains meaningful.
DELETE FROM public.notifications duplicate
USING public.notifications keeper
WHERE duplicate.type = 'mylist_status'
  AND NOT duplicate.read
  AND keeper.type = 'mylist_status'
  AND NOT keeper.read
  AND duplicate.recipient_id = keeper.recipient_id
  AND duplicate.actor_id = keeper.actor_id
  AND duplicate.mylist_anime_id = keeper.mylist_anime_id
  AND duplicate.mylist_status = keeper.mylist_status
  AND (duplicate.created_at, duplicate.id) > (keeper.created_at, keeper.id);

CREATE UNIQUE INDEX IF NOT EXISTS notifications_unread_mylist_dedupe_idx
    ON public.notifications (recipient_id, actor_id, mylist_anime_id, mylist_status)
    WHERE type = 'mylist_status' AND NOT read;

CREATE OR REPLACE FUNCTION public.notify_on_mylist_status()
RETURNS TRIGGER AS $$
DECLARE
    list_public BOOLEAN;
BEGIN
    IF NEW.status NOT IN ('watching', 'completed', 'plan_to_watch') THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
        RETURN NEW;
    END IF;

    SELECT p.list_is_public INTO list_public
    FROM public.profiles p
    WHERE p.id = NEW.user_id;

    IF list_public IS DISTINCT FROM TRUE THEN
        RETURN NEW;
    END IF;

    -- Read notifications can be repeated intentionally: once a prior
    -- notification is read, a later status change is meaningful again.
    INSERT INTO public.notifications
        (recipient_id, actor_id, type, mylist_anime_id, mylist_status)
    SELECT f.follower_id, NEW.user_id, 'mylist_status', NEW.anime_id, NEW.status
    FROM public.follows f
    WHERE f.following_id = NEW.user_id
    ON CONFLICT (recipient_id, actor_id, mylist_anime_id, mylist_status)
        WHERE type = 'mylist_status' AND NOT read
        DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Like-reaction users are private to the author of the post.  The previous
-- nullable comparison did not reject an anon request because NULL
-- comparisons evaluate to NULL rather than TRUE.
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
