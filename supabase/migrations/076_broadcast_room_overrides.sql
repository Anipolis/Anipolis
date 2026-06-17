-- Per-date overrides for irregular broadcast rooms (e.g. a single extended-length episode).
-- ensure_broadcast_room_session() consults this table before falling back to the anime's
-- regular broadcast_day/broadcast_time/broadcast_duration_minutes.

CREATE TABLE IF NOT EXISTS public.broadcast_room_overrides (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    anime_id integer NOT NULL REFERENCES public.anime(id) ON DELETE CASCADE,
    room_date date NOT NULL,
    broadcast_time text,
    duration_minutes integer CHECK (duration_minutes BETWEEN 1 AND 1440),
    pre_open_minutes integer CHECK (pre_open_minutes BETWEEN 0 AND 1440),
    post_close_minutes integer CHECK (post_close_minutes BETWEEN 0 AND 1440),
    is_cancelled boolean NOT NULL DEFAULT false,
    announcement_label text,
    note text,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (anime_id, room_date)
);

ALTER TABLE public.broadcast_room_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "broadcast_room_overrides: visible to all" ON public.broadcast_room_overrides;
CREATE POLICY "broadcast_room_overrides: visible to all"
    ON public.broadcast_room_overrides
    FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "broadcast_room_overrides: admin can insert" ON public.broadcast_room_overrides;
CREATE POLICY "broadcast_room_overrides: admin can insert"
    ON public.broadcast_room_overrides FOR INSERT
    TO authenticated
    WITH CHECK (public.is_current_user_admin());

DROP POLICY IF EXISTS "broadcast_room_overrides: admin can update" ON public.broadcast_room_overrides;
CREATE POLICY "broadcast_room_overrides: admin can update"
    ON public.broadcast_room_overrides FOR UPDATE
    TO authenticated
    USING (public.is_current_user_admin())
    WITH CHECK (public.is_current_user_admin());

DROP POLICY IF EXISTS "broadcast_room_overrides: admin can delete" ON public.broadcast_room_overrides;
CREATE POLICY "broadcast_room_overrides: admin can delete"
    ON public.broadcast_room_overrides FOR DELETE
    TO authenticated
    USING (public.is_current_user_admin());

CREATE OR REPLACE FUNCTION public.ensure_broadcast_room_session(p_anime_id integer, p_room_date date)
RETURNS SETOF public.broadcast_room_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    target_anime public.anime%ROWTYPE;
    override_row public.broadcast_room_overrides%ROWTYPE;
    effective_broadcast_time text;
    effective_duration_minutes integer;
    effective_pre_open_minutes integer;
    effective_post_close_minutes integer;
    scheduled_jst timestamp;
    scheduled_at timestamptz;
BEGIN
    SELECT * INTO target_anime FROM public.anime WHERE id = p_anime_id;
    IF NOT FOUND THEN
        RETURN;
    END IF;

    SELECT * INTO override_row
    FROM public.broadcast_room_overrides
    WHERE anime_id = p_anime_id AND room_date = p_room_date;

    IF NOT FOUND THEN
        -- No override: room must fall on the anime's regular broadcast day.
        IF target_anime.broadcast_day IS NULL
           OR target_anime.broadcast_time IS NULL
           OR EXTRACT(DOW FROM p_room_date)::integer <> target_anime.broadcast_day THEN
            RETURN;
        END IF;
    ELSIF override_row.is_cancelled THEN
        RETURN;
    END IF;

    IF (target_anime.aired_from IS NOT NULL AND p_room_date < target_anime.aired_from::date)
       OR (target_anime.aired_to IS NOT NULL AND p_room_date > target_anime.aired_to::date) THEN
        RETURN;
    END IF;

    effective_broadcast_time := COALESCE(override_row.broadcast_time, target_anime.broadcast_time);
    effective_duration_minutes := COALESCE(override_row.duration_minutes, target_anime.broadcast_duration_minutes);
    effective_pre_open_minutes := COALESCE(override_row.pre_open_minutes, target_anime.broadcast_room_pre_open_minutes);
    effective_post_close_minutes := COALESCE(override_row.post_close_minutes, target_anime.broadcast_room_post_close_minutes);

    IF effective_broadcast_time IS NULL THEN
        RETURN;
    END IF;

    scheduled_jst :=
        p_room_date::timestamp
        + (split_part(effective_broadcast_time, ':', 1)::integer || ' hours')::interval
        + (split_part(effective_broadcast_time, ':', 2)::integer || ' minutes')::interval;
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
        effective_duration_minutes,
        scheduled_at - (effective_pre_open_minutes || ' minutes')::interval,
        scheduled_at + ((effective_duration_minutes + effective_post_close_minutes) || ' minutes')::interval
    )
    ON CONFLICT (anime_id, room_date) DO UPDATE
    SET scheduled_at = EXCLUDED.scheduled_at,
        duration_minutes = EXCLUDED.duration_minutes,
        posting_opens_at = EXCLUDED.posting_opens_at,
        posting_closes_at = EXCLUDED.posting_closes_at
    WHERE public.broadcast_room_sessions.scheduled_at IS DISTINCT FROM EXCLUDED.scheduled_at
       OR public.broadcast_room_sessions.duration_minutes IS DISTINCT FROM EXCLUDED.duration_minutes;

    RETURN QUERY
        SELECT session.*
        FROM public.broadcast_room_sessions session
        WHERE session.anime_id = p_anime_id
          AND session.room_date = p_room_date;
END;
$$;
