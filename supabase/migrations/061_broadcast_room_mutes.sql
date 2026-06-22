-- Scheduled anime broadcast rooms and spoiler protection for their posts.

ALTER TABLE public.anime
    ADD COLUMN IF NOT EXISTS broadcast_duration_minutes integer NOT NULL DEFAULT 30
        CHECK (broadcast_duration_minutes BETWEEN 1 AND 1440),
    ADD COLUMN IF NOT EXISTS broadcast_room_pre_open_minutes integer NOT NULL DEFAULT 5
        CHECK (broadcast_room_pre_open_minutes BETWEEN 0 AND 1440),
    ADD COLUMN IF NOT EXISTS broadcast_room_post_close_minutes integer NOT NULL DEFAULT 30
        CHECK (broadcast_room_post_close_minutes BETWEEN 0 AND 1440);

DROP VIEW IF EXISTS public.anime_with_computed_broadcast_status;

CREATE VIEW public.anime_with_computed_broadcast_status
WITH (security_invoker = true) AS
SELECT
  anime.*,
  CASE
    WHEN aired_from IS NOT NULL AND aired_from > (now() AT TIME ZONE 'Asia/Tokyo')::date
      THEN 'upcoming'
    WHEN aired_to IS NOT NULL AND aired_to < (now() AT TIME ZONE 'Asia/Tokyo')::date
      THEN 'finished'
    WHEN aired_from IS NOT NULL
      AND aired_from <= (now() AT TIME ZONE 'Asia/Tokyo')::date
      AND aired_to IS NULL
      AND regexp_replace(lower(coalesce(type, '')), '[^a-z0-9]', '', 'g') IN ('movie', 'ona', 'ova', 'tvspecial', 'special')
      THEN 'finished'
    WHEN aired_from IS NOT NULL
      AND aired_from <= (now() AT TIME ZONE 'Asia/Tokyo')::date
      AND (aired_to IS NULL OR aired_to >= (now() AT TIME ZONE 'Asia/Tokyo')::date)
      THEN 'airing'
    ELSE 'unknown'
  END AS computed_broadcast_status
FROM public.anime;

GRANT SELECT ON public.anime_with_computed_broadcast_status TO anon, authenticated;

CREATE TABLE IF NOT EXISTS public.broadcast_room_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    anime_id integer NOT NULL REFERENCES public.anime(id) ON DELETE CASCADE,
    room_date date NOT NULL,
    scheduled_at timestamptz NOT NULL,
    duration_minutes integer NOT NULL CHECK (duration_minutes BETWEEN 1 AND 1440),
    posting_opens_at timestamptz NOT NULL,
    posting_closes_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (anime_id, room_date),
    CHECK (posting_opens_at <= scheduled_at),
    CHECK (posting_closes_at >= scheduled_at)
);

ALTER TABLE public.broadcast_room_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "broadcast_room_sessions: visible to all" ON public.broadcast_room_sessions;
CREATE POLICY "broadcast_room_sessions: visible to all"
    ON public.broadcast_room_sessions
    FOR SELECT
    USING (true);

CREATE OR REPLACE FUNCTION public.ensure_broadcast_room_session(p_anime_id integer, p_room_date date)
RETURNS SETOF public.broadcast_room_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    target_anime public.anime%ROWTYPE;
    scheduled_jst timestamp;
    scheduled_at timestamptz;
BEGIN
    SELECT * INTO target_anime FROM public.anime WHERE id = p_anime_id;
    IF NOT FOUND
       OR target_anime.broadcast_day IS NULL
       OR target_anime.broadcast_time IS NULL
       OR EXTRACT(DOW FROM p_room_date)::integer <> target_anime.broadcast_day
       OR (target_anime.aired_from IS NOT NULL AND p_room_date < target_anime.aired_from::date)
       OR (target_anime.aired_to IS NOT NULL AND p_room_date > target_anime.aired_to::date) THEN
        RETURN;
    END IF;

    scheduled_jst :=
        p_room_date::timestamp
        + (split_part(target_anime.broadcast_time, ':', 1)::integer || ' hours')::interval
        + (split_part(target_anime.broadcast_time, ':', 2)::integer || ' minutes')::interval;
    scheduled_at := scheduled_jst AT TIME ZONE 'Asia/Tokyo';

    INSERT INTO public.broadcast_room_sessions (
        anime_id,
        room_date,
        scheduled_at,
        duration_minutes,
        posting_opens_at,
        posting_closes_at
    )
    VALUES (
        target_anime.id,
        p_room_date,
        scheduled_at,
        target_anime.broadcast_duration_minutes,
        scheduled_at - (target_anime.broadcast_room_pre_open_minutes || ' minutes')::interval,
        scheduled_at
            + ((target_anime.broadcast_duration_minutes + target_anime.broadcast_room_post_close_minutes) || ' minutes')::interval
    )
    ON CONFLICT (anime_id, room_date) DO NOTHING;

    RETURN QUERY
        SELECT session.*
        FROM public.broadcast_room_sessions session
        WHERE session.anime_id = p_anime_id
          AND session.room_date = p_room_date;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_broadcast_room_session(integer, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_broadcast_room_session(integer, date) TO anon, authenticated;

DROP TRIGGER IF EXISTS posts_enforce_broadcast_room_window ON public.posts;

ALTER TABLE public.posts
    ADD COLUMN IF NOT EXISTS broadcast_room_session_id uuid
        REFERENCES public.broadcast_room_sessions(id) ON DELETE SET NULL;

-- Upgrade posts created by the earlier room-date implementation.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'posts'
          AND column_name = 'broadcast_room_date'
    ) THEN
        INSERT INTO public.broadcast_room_sessions (
            anime_id,
            room_date,
            scheduled_at,
            duration_minutes,
            posting_opens_at,
            posting_closes_at
        )
        SELECT DISTINCT
            post.anime_id,
            post.broadcast_room_date,
            scheduled.scheduled_at,
            anime.broadcast_duration_minutes,
            scheduled.scheduled_at - (anime.broadcast_room_pre_open_minutes || ' minutes')::interval,
            scheduled.scheduled_at
                + ((anime.broadcast_duration_minutes + anime.broadcast_room_post_close_minutes) || ' minutes')::interval
        FROM public.posts post
        JOIN public.anime anime ON anime.id = post.anime_id
        CROSS JOIN LATERAL (
            SELECT (
                post.broadcast_room_date::timestamp
                + (split_part(anime.broadcast_time, ':', 1)::integer || ' hours')::interval
                + (split_part(anime.broadcast_time, ':', 2)::integer || ' minutes')::interval
            ) AT TIME ZONE 'Asia/Tokyo' AS scheduled_at
        ) scheduled
        WHERE post.broadcast_room_date IS NOT NULL
          AND post.anime_id IS NOT NULL
          AND anime.broadcast_time IS NOT NULL
        ON CONFLICT (anime_id, room_date) DO NOTHING;

        UPDATE public.posts post
        SET broadcast_room_session_id = session.id
        FROM public.broadcast_room_sessions session
        WHERE post.broadcast_room_session_id IS NULL
          AND post.anime_id = session.anime_id
          AND post.broadcast_room_date = session.room_date;
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS posts_broadcast_room_session_idx
    ON public.posts (broadcast_room_session_id, created_at DESC)
    WHERE broadcast_room_session_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.enforce_broadcast_room_post_window()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    target_session public.broadcast_room_sessions%ROWTYPE;
BEGIN
    IF NEW.broadcast_room_session_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT * INTO target_session
    FROM public.broadcast_room_sessions
    WHERE id = NEW.broadcast_room_session_id;

    IF NOT FOUND OR NEW.anime_id IS DISTINCT FROM target_session.anime_id THEN
        RAISE EXCEPTION 'Invalid broadcast room session for post'
            USING ERRCODE = 'check_violation';
    END IF;

    IF clock_timestamp() < target_session.posting_opens_at
       OR clock_timestamp() > target_session.posting_closes_at THEN
        RAISE EXCEPTION 'Broadcast room is not accepting posts'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER posts_enforce_broadcast_room_window
    BEFORE INSERT OR UPDATE OF broadcast_room_session_id, anime_id ON public.posts
    FOR EACH ROW EXECUTE FUNCTION public.enforce_broadcast_room_post_window();

CREATE TABLE IF NOT EXISTS public.broadcast_room_mutes (
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    anime_id integer NOT NULL REFERENCES public.anime(id) ON DELETE CASCADE,
    room_date date NOT NULL,
    room_session_id uuid REFERENCES public.broadcast_room_sessions(id) ON DELETE CASCADE,
    duration_days smallint CHECK (duration_days BETWEEN 1 AND 7),
    mute_until_event_end boolean NOT NULL DEFAULT false,
    muted_until timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, anime_id),
    CONSTRAINT broadcast_room_mutes_duration_check CHECK (
        (mute_until_event_end AND duration_days IS NULL)
        OR (NOT mute_until_event_end AND duration_days IS NOT NULL)
    )
);

ALTER TABLE public.broadcast_room_mutes
    ADD COLUMN IF NOT EXISTS room_date date,
    ADD COLUMN IF NOT EXISTS room_session_id uuid
        REFERENCES public.broadcast_room_sessions(id) ON DELETE CASCADE;

-- Upgrade mute records created by the earlier room-date implementation.
DO $$
BEGIN
    UPDATE public.broadcast_room_mutes mute
    SET room_date = session.room_date
    FROM public.broadcast_room_sessions session
    WHERE mute.room_date IS NULL
      AND mute.room_session_id = session.id;

    INSERT INTO public.broadcast_room_sessions (
        anime_id,
        room_date,
        scheduled_at,
        duration_minutes,
        posting_opens_at,
        posting_closes_at
    )
    SELECT DISTINCT
        mute.anime_id,
        mute.room_date,
        scheduled.scheduled_at,
        anime.broadcast_duration_minutes,
        scheduled.scheduled_at - (anime.broadcast_room_pre_open_minutes || ' minutes')::interval,
        scheduled.scheduled_at
            + ((anime.broadcast_duration_minutes + anime.broadcast_room_post_close_minutes) || ' minutes')::interval
    FROM public.broadcast_room_mutes mute
    JOIN public.anime anime ON anime.id = mute.anime_id
    CROSS JOIN LATERAL (
        SELECT (
            mute.room_date::timestamp
            + (split_part(anime.broadcast_time, ':', 1)::integer || ' hours')::interval
            + (split_part(anime.broadcast_time, ':', 2)::integer || ' minutes')::interval
        ) AT TIME ZONE 'Asia/Tokyo' AS scheduled_at
    ) scheduled
    WHERE mute.room_date IS NOT NULL
      AND anime.broadcast_time IS NOT NULL
    ON CONFLICT (anime_id, room_date) DO NOTHING;

    UPDATE public.broadcast_room_mutes mute
    SET room_session_id = session.id
    FROM public.broadcast_room_sessions session
    WHERE mute.room_session_id IS NULL
      AND mute.anime_id = session.anime_id
      AND mute.room_date = session.room_date;

    DELETE FROM public.broadcast_room_mutes
    WHERE room_date IS NULL OR room_session_id IS NULL;
END;
$$;

ALTER TABLE public.broadcast_room_mutes
    ALTER COLUMN room_date SET NOT NULL,
    ALTER COLUMN room_session_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS broadcast_room_mutes_active_user_idx
    ON public.broadcast_room_mutes (user_id, muted_until DESC);

ALTER TABLE public.broadcast_room_mutes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "broadcast_room_mutes: users can manage own mutes" ON public.broadcast_room_mutes;
CREATE POLICY "broadcast_room_mutes: users can manage own mutes"
    ON public.broadcast_room_mutes
    FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Keep notification generation active for the configured room duration.
CREATE OR REPLACE FUNCTION public.enqueue_due_broadcast_notifications(target_user_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    jst_now timestamp := clock_timestamp() AT TIME ZONE 'Asia/Tokyo';
    current_week_start date;
BEGIN
    current_week_start := jst_now::date - EXTRACT(DOW FROM jst_now)::integer;

    INSERT INTO public.notifications (
        recipient_id,
        actor_id,
        type,
        post_id,
        broadcast_anime_id,
        broadcast_scheduled_at,
        broadcast_room_date,
        broadcast_offset_minutes
    )
    SELECT
        candidate.user_id,
        NULL,
        'broadcast',
        NULL,
        candidate.anime_id,
        candidate.scheduled_jst AT TIME ZONE 'Asia/Tokyo',
        candidate.room_date,
        candidate.notify_minutes
    FROM (
        SELECT
            subscription.user_id,
            anime.id AS anime_id,
            anime.broadcast_duration_minutes,
            GREATEST(
                CASE WHEN COALESCE(settings.notify_1min, true) THEN 1 ELSE 0 END,
                CASE WHEN COALESCE(settings.notify_5min, true) THEN 5 ELSE 0 END,
                CASE WHEN COALESCE(settings.notify_30min, false) THEN 30 ELSE 0 END
            ) AS notify_minutes,
            (
                current_week_start
                + (week.offset_days || ' days')::interval
                + (anime.broadcast_day || ' days')::interval
            )::date AS room_date,
            (
                (current_week_start + (week.offset_days || ' days')::interval)
                + (anime.broadcast_day || ' days')::interval
                + (split_part(anime.broadcast_time, ':', 1)::integer || ' hours')::interval
                + (split_part(anime.broadcast_time, ':', 2)::integer || ' minutes')::interval
            ) AS scheduled_jst
        FROM public.broadcast_notification_subscriptions subscription
        JOIN public.anime anime ON anime.id = subscription.anime_id
        LEFT JOIN public.broadcast_notification_settings settings ON settings.user_id = subscription.user_id
        CROSS JOIN (VALUES (-7), (0)) AS week(offset_days)
        WHERE (target_user_id IS NULL OR subscription.user_id = target_user_id)
          AND anime.broadcast_day IS NOT NULL
          AND anime.broadcast_time IS NOT NULL
    ) candidate
    JOIN public.anime anime ON anime.id = candidate.anime_id
    WHERE candidate.notify_minutes > 0
      AND candidate.scheduled_jst - (candidate.notify_minutes || ' minutes')::interval <= jst_now
      AND candidate.scheduled_jst + (candidate.broadcast_duration_minutes || ' minutes')::interval >= jst_now
      AND (anime.aired_from IS NULL OR candidate.room_date >= anime.aired_from::date)
      AND (anime.aired_to IS NULL OR candidate.room_date <= anime.aired_to::date)
    ON CONFLICT (recipient_id, broadcast_anime_id, broadcast_scheduled_at)
        WHERE type = 'broadcast'
        DO NOTHING;
END;
$$;
