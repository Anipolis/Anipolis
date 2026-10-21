-- ============================================================
-- 175_every_episode_session_has_room: 話数ルームの放送枠を必ずルームにつなぐ（#484）
-- ============================================================
-- 放送枠（room_kind = 'episode'）は、話数（episode_number）が 1〜9999 のときだけ話数ルームにつながっていた
-- （153 / 156）。話数の無い枠はどのルームにもつながらず、作品ページに「話数ルームに入っていない放送日」という
-- 別の枠組みができていた。話数が無くなる経路は次のとおり（#484）:
--   a. しょぼい同期の前に曜日と時刻から作った古い枠（今は作られない）
--   b. しょぼいの Count が空の番組（特番・総集編・先行放送など）
--   c. 取り込みの検査で話数が疑わしいとして話数を空にした枠
--   d. 管理者の上書き（しょぼいに無い日）から ensure_broadcast_room_session が作った枠
--   e. あとから話数が外れた枠
--
-- 方針（2026-10-22、ハルさん）:
--   * 話数の無い枠は、放送日ごとの特番ルーム（kind = 'special'、special_key = 'air-YYYY-MM-DD'）を自動で作ってつなぐ。
--     名前はしょぼいの副題（先頭の ^ を除く）か上書きのラベル、無ければ「M月D日の特番」。管理者はあとから
--     話数ルームへの統合（merge_episode_rooms）や名前の変更ができる
--   * 休止日の枠は特番ルームを作らない（つながないまま。休止日はルームログに出さない、156）
--   * d は、上書きに1話分の話数（episode_start = episode_end）があればその話数で作り、話数ルームにつなぐ
--   * a・c の既存の枠は、作品ページの推定（buildBroadcastEpisodeLog）と同じ規則で話数を保存する
--     スクリプト（scripts/backfill-episode-room-sessions.ts）で埋め直す。推定できない枠は、このトリガーで特番ルームに入る
--
-- 枠のつなぎ先が変わると、既存のトリガー（153）がその枠の投稿の episode_room_id とルームの開く時刻も合わせて直す。

CREATE OR REPLACE FUNCTION public.upsert_special_room_for_airing(
    p_anime_id integer,
    p_room_date date,
    p_label text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    room_id uuid;
    room_key text := 'air-' || to_char(p_room_date, 'YYYY-MM-DD');
    room_label text;
BEGIN
    -- しょぼいの副題は特番に ^ を付けることがあるので外す
    room_label := NULLIF(btrim(regexp_replace(COALESCE(p_label, ''), '^\^+', '')), '');
    room_label := COALESCE(left(room_label, 100), to_char(p_room_date, 'FMMM"月"FMDD"日"') || 'の特番');

    INSERT INTO public.episode_rooms (anime_id, kind, special_key, label)
    VALUES (p_anime_id, 'special', room_key, room_label)
    ON CONFLICT (anime_id, special_key) WHERE kind = 'special' DO NOTHING
    RETURNING id INTO room_id;

    IF room_id IS NULL THEN
        SELECT id INTO room_id
          FROM public.episode_rooms
         WHERE anime_id = p_anime_id AND kind = 'special' AND special_key = room_key;
    END IF;
    RETURN room_id;
END;
$$;
REVOKE ALL ON FUNCTION public.upsert_special_room_for_airing(integer, date, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_special_room_for_airing(integer, date, text) TO service_role;

CREATE OR REPLACE FUNCTION public.assign_broadcast_room_session_episode_room()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    special_label text;
BEGIN
    IF NEW.room_kind <> 'episode' THEN
        -- 話数の放送枠でなくなったもの（ロビーへの変更など）はルームから外す
        NEW.episode_room_id := NULL;
        RETURN NEW;
    END IF;

    -- 話数は URL と同じく 9999 まで（156）
    IF NEW.episode_number BETWEEN 1 AND 9999 THEN
        NEW.episode_room_id := public.upsert_episode_room_for_airing(NEW.anime_id, NEW.episode_number);
        RETURN NEW;
    END IF;

    -- 休止日の枠は特番ルームを作らない
    IF public.is_broadcast_room_session_cancelled(NEW.anime_id, NEW.room_date) THEN
        NEW.episode_room_id := NULL;
        RETURN NEW;
    END IF;

    -- 話数の無い枠: 放送日ごとの特番ルームにつなぐ（175）
    SELECT NULLIF(btrim(o.episode_label), '') INTO special_label
      FROM public.broadcast_room_overrides o
     WHERE o.anime_id = NEW.anime_id AND o.room_date = NEW.room_date;
    NEW.episode_room_id := public.upsert_special_room_for_airing(
        NEW.anime_id,
        NEW.room_date,
        COALESCE(special_label, NEW.episode_title)
    );
    RETURN NEW;
END;
$$;

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

    -- 上書きに1話分の話数があれば、その話数で作る（話数ルームにつながる）。
    -- 話数が無い・複数話の上書きは、上書きのラベルを副題にして特番ルームにつながる（175）
    INSERT INTO public.broadcast_room_sessions (
        anime_id,
        room_date,
        room_kind,
        room_key,
        scheduled_at,
        duration_minutes,
        posting_opens_at,
        posting_closes_at,
        episode_number,
        episode_title
    )
    VALUES (
        target_anime.id,
        p_room_date,
        'episode',
        p_room_date::text,
        scheduled_at,
        effective_duration_minutes,
        scheduled_at - (effective_pre_open_minutes || ' minutes')::interval,
        scheduled_at + ((effective_duration_minutes + effective_post_close_minutes) || ' minutes')::interval,
        CASE
            WHEN override_row.episode_start BETWEEN 1 AND 9999
             AND COALESCE(override_row.episode_end, override_row.episode_start) = override_row.episode_start
            THEN override_row.episode_start
        END,
        NULLIF(btrim(override_row.episode_label), '')
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

