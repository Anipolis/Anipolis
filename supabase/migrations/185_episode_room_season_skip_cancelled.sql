-- 通算の話数の作品の範囲（184）で、休止になった放送枠を初回の手がかりにしない。
-- 画面側（getEpisodeRoomLog）は休止の枠を除いて計算するので、DB だけ数えると範囲が食い違っていた。

CREATE OR REPLACE FUNCTION public.ensure_episode_room(p_anime_id integer, p_episode_number integer)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    room public.episode_rooms%ROWTYPE;
    target_anime public.anime%ROWTYPE;
    max_aired_episode integer;
    min_room_number integer;
    max_room_number integer;
    season_first integer;
    season_last integer;
    season_ended boolean := false;
    first_airing_number integer;
    first_airing_date date;
    opens timestamptz;
    today_jst date := (now() AT TIME ZONE 'Asia/Tokyo')::date;
BEGIN
    IF p_anime_id IS NULL OR p_episode_number IS NULL OR p_episode_number < 1 OR p_episode_number > 9999 THEN
        RETURN NULL;
    END IF;

    -- 管理者が非表示にした作品は、既にあるルームも返さない（#387 Codex）
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

    IF (target_anime.hidden_by_admin AND NOT public.is_current_user_admin())
       OR target_anime.room_type = 'global'
       OR NOT (
           target_anime.type = 'TV'
           OR (target_anime.type IN ('ONA', 'OVA') AND COALESCE(target_anime.episode_total, 0) >= 2)
       ) THEN
        RETURN NULL;
    END IF;

    -- 開ける話数の範囲。通算の話数の作品（総話数を超える話数のルームがある）は、そのシーズンの範囲だけ。
    -- 計算は src/lib/episode-room.ts の cumulativeSeasonRange と同じ
    IF target_anime.episode_total IS NOT NULL THEN
        SELECT min(r.episode_number), max(r.episode_number)
          INTO min_room_number, max_room_number
          FROM public.episode_rooms r
         WHERE r.anime_id = p_anime_id
           AND r.kind = 'episode'
           AND r.merged_into IS NULL
           AND r.episode_number IS NOT NULL;

        IF target_anime.episode_total >= 1 AND max_room_number > target_anime.episode_total THEN
            -- 放送枠のあるルームで最も早いもの（開いただけでできたルームは放送枠が無いので手がかりにしない）
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

            season_ended := target_anime.aired_to IS NOT NULL AND target_anime.aired_to < today_jst;
            -- 放送開始の週の放送なら初回とみなす（1 日前まで。7 日後は第2話なので含めない）
            IF first_airing_date IS NOT NULL
               AND target_anime.aired_from IS NOT NULL
               AND first_airing_date - target_anime.aired_from BETWEEN -1 AND 6 THEN
                season_first := first_airing_number;
                season_last := GREATEST(max_room_number, first_airing_number + target_anime.episode_total - 1);
            ELSIF season_ended THEN
                season_first := GREATEST(1, max_room_number - target_anime.episode_total + 1);
                season_last := max_room_number;
            ELSE
                season_first := min_room_number;
                season_last := GREATEST(max_room_number, min_room_number + target_anime.episode_total - 1);
            END IF;
            IF p_episode_number < season_first OR p_episode_number > season_last THEN
                RETURN NULL;
            END IF;
        ELSIF p_episode_number > target_anime.episode_total THEN
            RETURN NULL;
        END IF;
    END IF;

    SELECT max(s.episode_number) INTO max_aired_episode
      FROM public.broadcast_room_sessions s
     WHERE s.anime_id = p_anime_id
       AND s.room_kind = 'episode'
       AND s.episode_number IS NOT NULL
       AND s.posting_opens_at <= now()
       AND NOT public.is_broadcast_room_session_cancelled(s.anime_id, s.room_date);

    IF max_aired_episode IS NOT NULL THEN
        -- 放送が終わった通算の作品は、放送枠が抜けた話も範囲内なら開ける
        IF p_episode_number > max_aired_episode AND NOT season_ended THEN
            RETURN NULL;
        END IF;
        opens := now();
    ELSIF target_anime.episode_total IS NULL THEN
        RETURN NULL;
    ELSIF target_anime.status = 'finished' THEN
        opens := now();
    ELSIF target_anime.type IN ('ONA', 'OVA')
          AND target_anime.aired_from IS NOT NULL
          AND target_anime.aired_from <= today_jst THEN
        -- 配信作品は配信開始日に全話を開く
        opens := LEAST(now(), (target_anime.aired_from::timestamp AT TIME ZONE 'Asia/Tokyo'));
    ELSE
        RETURN NULL;
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
