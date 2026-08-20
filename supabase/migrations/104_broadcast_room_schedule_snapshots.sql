-- Keep durable broadcast-room schedule snapshots while Syobocal program rows remain a rolling cache.

ALTER TABLE public.broadcast_room_sessions
    ADD COLUMN IF NOT EXISTS schedule_source text,
    ADD COLUMN IF NOT EXISTS source_program_id bigint,
    ADD COLUMN IF NOT EXISTS source_title_id bigint,
    ADD COLUMN IF NOT EXISTS source_channel_id bigint,
    ADD COLUMN IF NOT EXISTS source_channel_name text,
    ADD COLUMN IF NOT EXISTS episode_number integer,
    ADD COLUMN IF NOT EXISTS episode_title text,
    ADD COLUMN IF NOT EXISTS source_snapshot jsonb,
    ADD COLUMN IF NOT EXISTS schedule_frozen_at timestamptz,
    ADD COLUMN IF NOT EXISTS schedule_correction_note text;

ALTER TABLE public.broadcast_room_sessions
    DROP CONSTRAINT IF EXISTS broadcast_room_sessions_schedule_source_check;
ALTER TABLE public.broadcast_room_sessions
    ADD CONSTRAINT broadcast_room_sessions_schedule_source_check
    CHECK (schedule_source IS NULL OR schedule_source IN ('syobocal'));

ALTER TABLE public.broadcast_room_sessions
    DROP CONSTRAINT IF EXISTS broadcast_room_sessions_source_snapshot_check;
ALTER TABLE public.broadcast_room_sessions
    ADD CONSTRAINT broadcast_room_sessions_source_snapshot_check
    CHECK (source_snapshot IS NULL OR jsonb_typeof(source_snapshot) = 'object');

CREATE UNIQUE INDEX IF NOT EXISTS broadcast_room_sessions_syobocal_pid_idx
    ON public.broadcast_room_sessions (schedule_source, source_program_id)
    WHERE schedule_source = 'syobocal' AND source_program_id IS NOT NULL;

ALTER TABLE public.posts
    DROP CONSTRAINT IF EXISTS posts_broadcast_room_session_id_fkey;
ALTER TABLE public.posts
    ADD CONSTRAINT posts_broadcast_room_session_id_fkey
    FOREIGN KEY (broadcast_room_session_id)
    REFERENCES public.broadcast_room_sessions(id)
    ON DELETE RESTRICT;

UPDATE public.broadcast_room_sessions session
SET schedule_frozen_at = LEAST(
    session.posting_opens_at,
    COALESCE(
        (SELECT min(post.created_at) FROM public.posts post WHERE post.broadcast_room_session_id = session.id),
        session.posting_opens_at
    )
)
WHERE session.schedule_frozen_at IS NULL
  AND (
      session.posting_opens_at <= now()
      OR EXISTS (
          SELECT 1 FROM public.posts post WHERE post.broadcast_room_session_id = session.id
      )
  );

CREATE OR REPLACE FUNCTION public.protect_frozen_broadcast_room_schedule()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    is_frozen boolean;
BEGIN
    is_frozen := OLD.schedule_frozen_at IS NOT NULL
        OR OLD.posting_opens_at <= now()
        OR EXISTS (
            SELECT 1 FROM public.posts post WHERE post.broadcast_room_session_id = OLD.id
        );

    IF is_frozen AND (
        NEW.room_date IS DISTINCT FROM OLD.room_date
        OR NEW.room_kind IS DISTINCT FROM OLD.room_kind
        OR NEW.room_key IS DISTINCT FROM OLD.room_key
        OR NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at
        OR NEW.duration_minutes IS DISTINCT FROM OLD.duration_minutes
        OR NEW.posting_opens_at IS DISTINCT FROM OLD.posting_opens_at
        OR NEW.posting_closes_at IS DISTINCT FROM OLD.posting_closes_at
        OR NEW.schedule_source IS DISTINCT FROM OLD.schedule_source
        OR NEW.source_program_id IS DISTINCT FROM OLD.source_program_id
        OR NEW.source_title_id IS DISTINCT FROM OLD.source_title_id
        OR NEW.source_channel_id IS DISTINCT FROM OLD.source_channel_id
        OR NEW.source_channel_name IS DISTINCT FROM OLD.source_channel_name
        OR NEW.episode_number IS DISTINCT FROM OLD.episode_number
        OR NEW.episode_title IS DISTINCT FROM OLD.episode_title
        OR NEW.source_snapshot IS DISTINCT FROM OLD.source_snapshot
    ) THEN
        RAISE EXCEPTION 'broadcast room schedule is frozen for session %', OLD.id
            USING ERRCODE = '23514';
    END IF;

    IF is_frozen AND NEW.schedule_frozen_at IS NULL THEN
        NEW.schedule_frozen_at := COALESCE(OLD.schedule_frozen_at, OLD.posting_opens_at, now());
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS broadcast_room_sessions_protect_frozen_schedule
    ON public.broadcast_room_sessions;
CREATE TRIGGER broadcast_room_sessions_protect_frozen_schedule
    BEFORE UPDATE ON public.broadcast_room_sessions
    FOR EACH ROW EXECUTE FUNCTION public.protect_frozen_broadcast_room_schedule();

CREATE OR REPLACE FUNCTION public.freeze_broadcast_room_schedule_on_first_post()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.broadcast_room_session_id IS NOT NULL THEN
        UPDATE public.broadcast_room_sessions
        SET schedule_frozen_at = COALESCE(schedule_frozen_at, NEW.created_at, now())
        WHERE id = NEW.broadcast_room_session_id
          AND schedule_frozen_at IS NULL;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS posts_freeze_broadcast_room_schedule ON public.posts;
CREATE TRIGGER posts_freeze_broadcast_room_schedule
    AFTER INSERT OR UPDATE OF broadcast_room_session_id ON public.posts
    FOR EACH ROW EXECUTE FUNCTION public.freeze_broadcast_room_schedule_on_first_post();

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
    has_override boolean;
BEGIN
    SELECT * INTO target_anime FROM public.anime WHERE id = p_anime_id;
    IF NOT FOUND OR target_anime.room_type = 'global' THEN
        RETURN;
    END IF;

    SELECT * INTO override_row
    FROM public.broadcast_room_overrides
    WHERE anime_id = p_anime_id AND room_date = p_room_date;
    has_override := FOUND;

    IF has_override AND override_row.is_cancelled THEN
        RETURN;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.broadcast_room_sessions session
        WHERE session.anime_id = p_anime_id
          AND session.room_kind = 'episode'
          AND session.room_key = p_room_date::text
    ) THEN
        RETURN QUERY
            SELECT session.*
            FROM public.broadcast_room_sessions session
            WHERE session.anime_id = p_anime_id
              AND session.room_kind = 'episode'
              AND session.room_key = p_room_date::text;
        RETURN;
    END IF;

    IF NOT has_override THEN
        IF target_anime.broadcast_day IS NULL
           OR target_anime.broadcast_time IS NULL
           OR EXTRACT(DOW FROM p_room_date)::integer <> target_anime.broadcast_day THEN
            RETURN;
        END IF;
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
    WHERE public.broadcast_room_sessions.schedule_source IS NULL
      AND public.broadcast_room_sessions.source_program_id IS NULL
      AND public.broadcast_room_sessions.schedule_frozen_at IS NULL
      AND public.broadcast_room_sessions.posting_opens_at > now()
      AND (
          public.broadcast_room_sessions.scheduled_at IS DISTINCT FROM EXCLUDED.scheduled_at
          OR public.broadcast_room_sessions.duration_minutes IS DISTINCT FROM EXCLUDED.duration_minutes
          OR public.broadcast_room_sessions.posting_opens_at IS DISTINCT FROM EXCLUDED.posting_opens_at
          OR public.broadcast_room_sessions.posting_closes_at IS DISTINCT FROM EXCLUDED.posting_closes_at
      );

    RETURN QUERY
        SELECT session.*
        FROM public.broadcast_room_sessions session
        WHERE session.anime_id = p_anime_id
          AND session.room_kind = 'episode'
          AND session.room_key = p_room_date::text;
END;
$$;

COMMENT ON COLUMN public.broadcast_room_sessions.source_snapshot IS
    'Durable display snapshot copied from an external schedule before its rolling raw rows are pruned.';
COMMENT ON COLUMN public.broadcast_room_sessions.schedule_frozen_at IS
    'Once set, schedule identity and timing fields are immutable; correction notes may still be appended.';
