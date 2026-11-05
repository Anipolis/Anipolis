-- 通算の話数の作品（全12話で第25〜36話など）で、話数ルームを開ける範囲をそのシーズンに合わせる。
-- これまでは総話数以下の話だけ開けたので、シーズンの話（第25話）は開けず、シーズンの外の話（第5話）が開けた。
-- 変えるのは範囲の判定だけで、それ以外は 156 のまま。

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
            IF target_anime.aired_to IS NOT NULL AND target_anime.aired_to < today_jst THEN
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
        IF p_episode_number > max_aired_episode THEN
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
