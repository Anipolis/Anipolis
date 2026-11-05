-- 話数ルームの範囲と開ける話数を DB の 1 か所で計算する（episode_room_bounds）。
-- これまではアプリ（src/lib/episode-room.ts）と ensure_episode_room に同じ計算があり、食い違うことがあった。
-- 作品ページとルームのページは、この関数の結果を表示する。
--
-- あわせて、放送開始の週の話数が 2 以上なら、総話数を超える前でも通算の話数の作品と判定する
-- （全24話で第13話から始まる作品に、第1話から余分なマスが並ばないようにする）。

CREATE OR REPLACE FUNCTION public.episode_room_bounds(p_anime_id integer)
RETURNS TABLE (
    season_first integer,
    season_last integer,
    openable_up_to integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    target_anime public.anime%ROWTYPE;
    today_jst date := (now() AT TIME ZONE 'Asia/Tokyo')::date;
    min_room_number integer;
    max_room_number integer;
    first_airing_number integer;
    first_airing_date date;
    max_aired_episode integer;
    anchored boolean := false;
    ended boolean := false;
BEGIN
    SELECT * INTO target_anime FROM public.anime WHERE id = p_anime_id;
    IF NOT FOUND OR (target_anime.hidden_by_admin AND NOT public.is_current_user_admin()) THEN
        RETURN;
    END IF;

    openable_up_to := 0;
    -- 話数ルームを持たない作品（src/lib/episode-room.ts の hasEpisodeRooms と同じ条件）
    IF target_anime.room_type = 'global'
       OR NOT (
           target_anime.type = 'TV'
           OR (target_anime.type IN ('ONA', 'OVA') AND COALESCE(target_anime.episode_total, 0) >= 2)
       ) THEN
        RETURN NEXT;
        RETURN;
    END IF;

    ended := target_anime.aired_to IS NOT NULL AND target_anime.aired_to < today_jst;

    -- シーズンの範囲（通算の話数の作品だけ。それ以外は season_first / season_last が NULL）
    IF COALESCE(target_anime.episode_total, 0) >= 1 THEN
        SELECT min(r.episode_number), max(r.episode_number)
          INTO min_room_number, max_room_number
          FROM public.episode_rooms r
         WHERE r.anime_id = p_anime_id
           AND r.kind = 'episode'
           AND r.merged_into IS NULL
           AND r.episode_number IS NOT NULL;

        -- 放送枠のあるルームで最も早いもの（放送枠の無いルームと休止の枠は手がかりにしない）
        SELECT r.episode_number, s.room_date::date
          INTO first_airing_number, first_airing_date
          FROM public.broadcast_room_sessions s
          JOIN public.episode_rooms r ON r.id = s.episode_room_id
         WHERE r.anime_id = p_anime_id
           AND r.kind = 'episode'
           AND r.merged_into IS NULL
           AND r.episode_number IS NOT NULL
           AND s.airing_kind = 'first'
           AND NOT public.is_broadcast_room_session_cancelled(s.anime_id, s.room_date)
         ORDER BY s.room_date, r.episode_number
         LIMIT 1;

        -- 放送開始の週の放送なら初回とみなす（1 日前まで。7 日後は第2話なので含めない）
        anchored := first_airing_date IS NOT NULL
            AND target_anime.aired_from IS NOT NULL
            AND first_airing_date - target_anime.aired_from BETWEEN -1 AND 6;

        IF max_room_number > target_anime.episode_total OR (anchored AND first_airing_number > 1) THEN
            IF anchored THEN
                season_first := first_airing_number;
                season_last := GREATEST(max_room_number, first_airing_number + target_anime.episode_total - 1);
            ELSIF ended THEN
                season_first := GREATEST(1, max_room_number - target_anime.episode_total + 1);
                season_last := max_room_number;
            ELSE
                season_first := min_room_number;
                season_last := GREATEST(max_room_number, min_room_number + target_anime.episode_total - 1);
            END IF;
        END IF;
    END IF;

    -- 開ける話数（ルームがまだ無くても投稿で作れる最後の話数）
    SELECT max(s.episode_number) INTO max_aired_episode
      FROM public.broadcast_room_sessions s
     WHERE s.anime_id = p_anime_id
       AND s.room_kind = 'episode'
       AND s.episode_number IS NOT NULL
       AND s.posting_opens_at <= now()
       AND NOT public.is_broadcast_room_session_cancelled(s.anime_id, s.room_date);

    IF max_aired_episode IS NOT NULL THEN
        openable_up_to := max_aired_episode;
    ELSIF target_anime.episode_total IS NOT NULL
          AND (
              target_anime.status = 'finished'
              -- 配信作品は配信開始日に全話を開く
              OR (
                  target_anime.type IN ('ONA', 'OVA')
                  AND target_anime.aired_from IS NOT NULL
                  AND target_anime.aired_from <= today_jst
              )
          ) THEN
        openable_up_to := target_anime.episode_total;
    END IF;

    -- 放送が終わった通算の作品は、放送枠が抜けた話も範囲内なら開ける
    IF season_last IS NOT NULL AND ended THEN
        openable_up_to := GREATEST(openable_up_to, season_last);
    END IF;

    RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.episode_room_bounds(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.episode_room_bounds(integer) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ensure_episode_room(p_anime_id integer, p_episode_number integer)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    room public.episode_rooms%ROWTYPE;
    target_anime public.anime%ROWTYPE;
    bounds record;
    opens timestamptz := now();
    today_jst date := (now() AT TIME ZONE 'Asia/Tokyo')::date;
BEGIN
    IF p_anime_id IS NULL OR p_episode_number IS NULL OR p_episode_number < 1 OR p_episode_number > 9999 THEN
        RETURN NULL;
    END IF;

    -- 管理者が非表示にした作品は、既にあるルームも返さない
    SELECT * INTO target_anime FROM public.anime WHERE id = p_anime_id;
    IF NOT FOUND OR (target_anime.hidden_by_admin AND NOT public.is_current_user_admin()) THEN
        RETURN NULL;
    END IF;

    SELECT * INTO room
      FROM public.episode_rooms
     WHERE anime_id = p_anime_id AND kind = 'episode' AND episode_number = p_episode_number;
    IF FOUND THEN
        RETURN room.id;
    END IF;

    SELECT * INTO bounds FROM public.episode_room_bounds(p_anime_id);
    IF NOT FOUND OR p_episode_number > bounds.openable_up_to THEN
        RETURN NULL;
    END IF;
    IF bounds.season_first IS NOT NULL THEN
        IF p_episode_number < bounds.season_first OR p_episode_number > bounds.season_last THEN
            RETURN NULL;
        END IF;
    ELSIF target_anime.episode_total IS NOT NULL AND p_episode_number > target_anime.episode_total THEN
        RETURN NULL;
    END IF;

    IF target_anime.type IN ('ONA', 'OVA')
       AND target_anime.aired_from IS NOT NULL
       AND target_anime.aired_from <= today_jst THEN
        opens := LEAST(now(), (target_anime.aired_from::timestamp AT TIME ZONE 'Asia/Tokyo'));
    END IF;

    INSERT INTO public.episode_rooms (anime_id, kind, episode_number, opens_at)
    VALUES (p_anime_id, 'episode', p_episode_number, opens)
    ON CONFLICT (anime_id, episode_number) WHERE kind = 'episode' DO NOTHING
    RETURNING * INTO room;

    IF room.id IS NULL THEN
        SELECT * INTO room
          FROM public.episode_rooms
         WHERE anime_id = p_anime_id AND kind = 'episode' AND episode_number = p_episode_number;
    END IF;
    RETURN room.id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_episode_room(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_episode_room(integer, integer) TO authenticated, service_role;
