-- Adds per-anime room mode and a reusable global lobby session for short-form anime.

ALTER TABLE public.anime
	ADD COLUMN IF NOT EXISTS room_type text NOT NULL DEFAULT 'episode';

ALTER TABLE public.anime
	DROP CONSTRAINT IF EXISTS anime_room_type_check;

ALTER TABLE public.anime
	ADD CONSTRAINT anime_room_type_check
	CHECK (room_type IN ('episode', 'global'));

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

ALTER TABLE public.broadcast_room_sessions
	ADD COLUMN IF NOT EXISTS room_kind text NOT NULL DEFAULT 'episode',
	ADD COLUMN IF NOT EXISTS room_key text NOT NULL DEFAULT '';

UPDATE public.broadcast_room_sessions
SET room_key = room_date::text
WHERE room_key = '';

ALTER TABLE public.broadcast_room_sessions
	DROP CONSTRAINT IF EXISTS broadcast_room_sessions_room_kind_check;

ALTER TABLE public.broadcast_room_sessions
	ADD CONSTRAINT broadcast_room_sessions_room_kind_check
	CHECK (room_kind IN ('episode', 'global'));

CREATE UNIQUE INDEX IF NOT EXISTS broadcast_room_sessions_anime_room_kind_key_idx
	ON public.broadcast_room_sessions (anime_id, room_kind, room_key);

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
    IF NOT FOUND OR target_anime.room_type = 'global' THEN
        RETURN;
    END IF;

    SELECT * INTO override_row
    FROM public.broadcast_room_overrides
    WHERE anime_id = p_anime_id AND room_date = p_room_date;

    IF NOT FOUND THEN
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
        room_kind,
        room_key,
        scheduled_at,
        duration_minutes,
        posting_opens_at,
        posting_closes_at
    )
    VALUES (
        target_anime.id,
        p_room_date,
        'episode',
        p_room_date::text,
        scheduled_at,
        effective_duration_minutes,
        scheduled_at - (effective_pre_open_minutes || ' minutes')::interval,
        scheduled_at + ((effective_duration_minutes + effective_post_close_minutes) || ' minutes')::interval
    )
    ON CONFLICT (anime_id, room_kind, room_key) DO UPDATE
    SET scheduled_at = EXCLUDED.scheduled_at,
        duration_minutes = EXCLUDED.duration_minutes,
        posting_opens_at = EXCLUDED.posting_opens_at,
        posting_closes_at = EXCLUDED.posting_closes_at
    WHERE public.broadcast_room_sessions.scheduled_at IS DISTINCT FROM EXCLUDED.scheduled_at
       OR public.broadcast_room_sessions.duration_minutes IS DISTINCT FROM EXCLUDED.duration_minutes
       OR public.broadcast_room_sessions.posting_opens_at IS DISTINCT FROM EXCLUDED.posting_opens_at
       OR public.broadcast_room_sessions.posting_closes_at IS DISTINCT FROM EXCLUDED.posting_closes_at;

    RETURN QUERY
        SELECT session.*
        FROM public.broadcast_room_sessions session
        WHERE session.anime_id = p_anime_id
          AND session.room_kind = 'episode'
          AND session.room_key = p_room_date::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_global_anime_lobby_session(p_anime_id integer)
RETURNS SETOF public.broadcast_room_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    target_anime public.anime%ROWTYPE;
    lobby_date date;
    scheduled_at timestamptz;
BEGIN
    SELECT * INTO target_anime FROM public.anime WHERE id = p_anime_id;
    IF NOT FOUND OR target_anime.room_type <> 'global' THEN
        RETURN;
    END IF;

    lobby_date := COALESCE(target_anime.aired_from::date, target_anime.created_at::date, CURRENT_DATE);
    scheduled_at := lobby_date::timestamp AT TIME ZONE 'Asia/Tokyo';

    INSERT INTO public.broadcast_room_sessions (
        anime_id,
        room_date,
        room_kind,
        room_key,
        scheduled_at,
        duration_minutes,
        posting_opens_at,
        posting_closes_at
    )
    VALUES (
        target_anime.id,
        lobby_date,
        'global',
        'lobby',
        scheduled_at,
        1,
        scheduled_at,
        '9999-12-31 23:59:59+00'::timestamptz
    )
    ON CONFLICT (anime_id, room_kind, room_key) DO UPDATE
    SET posting_closes_at = EXCLUDED.posting_closes_at
    WHERE public.broadcast_room_sessions.posting_closes_at IS DISTINCT FROM EXCLUDED.posting_closes_at;

    RETURN QUERY
        SELECT session.*
        FROM public.broadcast_room_sessions session
        WHERE session.anime_id = p_anime_id
          AND session.room_kind = 'global'
          AND session.room_key = 'lobby';
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_global_anime_lobby_session(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_global_anime_lobby_session(integer) TO anon, authenticated;
