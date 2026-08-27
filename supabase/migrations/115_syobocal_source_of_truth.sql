-- Syobocal becomes the single source of truth for the calendar and broadcast
-- rooms. The on-demand fallback that fabricated sessions from anime.broadcast_day
-- / broadcast_time is removed: episode sessions now exist only when the Syobocal
-- program sync created them, or when an admin registered an explicit override
-- for that date. Also adds tracking for automatic global-lobby classification.
--
-- 適用順の注意: 末尾の DELETE はフォールバック生成された未来セッションを消すため、
-- Syobocal 同期が一度も完走していない環境で先に適用すると、broadcast_day/time しか
-- 情報が無い作品の未来ルームが同期完了まで空になる（凍結済み・投稿済みは除外される
-- ので整合性の破壊は無く、同期再実行で復旧する）。新環境では「Syobocal 同期を完走
-- させてから適用」し、適用後に未来セッション件数を確認すること。

-- 1) Track how room_type was decided so the automatic short-anime rule never
--    overwrites an explicit admin choice.
ALTER TABLE public.anime
    ADD COLUMN IF NOT EXISTS room_type_source text NOT NULL DEFAULT 'default';
ALTER TABLE public.anime
    DROP CONSTRAINT IF EXISTS anime_room_type_source_check;
ALTER TABLE public.anime
    ADD CONSTRAINT anime_room_type_source_check
    CHECK (room_type_source IN ('default', 'auto', 'manual'));
COMMENT ON COLUMN public.anime.room_type_source IS
    'How room_type was decided: default (never touched), auto (short-anime rule), manual (admin).';

-- 2) ensure_broadcast_room_session no longer fabricates sessions from
--    broadcast_day/broadcast_time. It returns existing (Syobocal-synced)
--    sessions, and creates one only for an explicit non-cancelled override.
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

    SELECT * INTO override_row
    FROM public.broadcast_room_overrides
    WHERE anime_id = p_anime_id AND room_date = p_room_date;
    -- No Syobocal session and no explicit admin override: nothing is created.
    IF NOT FOUND OR override_row.is_cancelled THEN
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

-- 3) Remove future sessions the old fallback fabricated (no Syobocal origin,
--    no admin override, not frozen, not yet open). Past sessions stay as held
--    room history.
DELETE FROM public.broadcast_room_sessions session
WHERE session.room_kind = 'episode'
  AND session.schedule_source IS NULL
  AND session.schedule_frozen_at IS NULL
  AND session.posting_opens_at > now()
  AND NOT EXISTS (
      SELECT 1
      FROM public.broadcast_room_overrides override
      WHERE override.anime_id = session.anime_id
        AND override.room_date::text = session.room_key
  );
