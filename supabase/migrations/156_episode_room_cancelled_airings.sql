-- ============================================================
-- 156_episode_room_cancelled_airings: 休止した放送枠で話数ルームを開かない（#387 の Codex レビュー）
-- ============================================================
-- 管理者が放送日に休止（broadcast_room_overrides.is_cancelled）を登録しても放送枠の行は残る。153 は
-- その行も話数ルームの開く時刻（opens_at）や「放送済みの最大話数」に数えていたため、休止した話の
-- ルームが休止した放送の時刻に開いていた（日付のルームログ buildBroadcastEpisodeLog は休止日を除く）。
--   * 開く時刻は休止していない放送枠から計算する。全部休止なら、まだ開いていないルームは未定に戻す
--     （開いたルームは閉じない・管理者が設定した開く時刻は変えない、は 153 と同じ）
--   * 休止の登録・変更・削除のたびに、その日の放送枠のルームの開く時刻を計算し直す
--   * ensure_episode_room() の「放送済みの最大話数」からも休止した放送枠を除く
--   * 話数は URL と同じく 9999 までにする（作品ページの一覧を際限なく作らないように）

-- 放送日が休止になっているか
CREATE OR REPLACE FUNCTION public.is_broadcast_room_session_cancelled(p_anime_id integer, p_room_date date)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.broadcast_room_overrides o
        WHERE o.anime_id = p_anime_id
          AND o.room_date = p_room_date
          AND o.is_cancelled
    );
$$;

REVOKE ALL ON FUNCTION public.is_broadcast_room_session_cancelled(integer, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_broadcast_room_session_cancelled(integer, date) TO service_role;

CREATE OR REPLACE FUNCTION public.refresh_episode_room_opens_at(p_room_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    earliest timestamptz;
BEGIN
    IF p_room_id IS NULL THEN
        RETURN;
    END IF;

    SELECT min(s.posting_opens_at) INTO earliest
      FROM public.broadcast_room_sessions s
     WHERE s.episode_room_id = p_room_id
       AND NOT public.is_broadcast_room_session_cancelled(s.anime_id, s.room_date);

    IF earliest IS NULL THEN
        -- 休止していない放送枠が無い。放送枠はあるのに全部休止なら、まだ開いていないルームは未定に戻す
        -- （放送枠が一つも無いルーム＝過去作などで作ったルームはそのまま）
        IF EXISTS (SELECT 1 FROM public.broadcast_room_sessions WHERE episode_room_id = p_room_id) THEN
            UPDATE public.episode_rooms
               SET opens_at = NULL
             WHERE id = p_room_id
               AND NOT opens_at_locked
               AND opens_at IS NOT NULL
               AND opens_at > now();
        END IF;
        RETURN;
    END IF;

    UPDATE public.episode_rooms
       SET opens_at = CASE
            WHEN opens_at IS NULL OR opens_at > now() THEN earliest
            ELSE LEAST(opens_at, earliest)
        END
     WHERE id = p_room_id
       AND NOT opens_at_locked
       AND opens_at IS DISTINCT FROM CASE
            WHEN opens_at IS NULL OR opens_at > now() THEN earliest
            ELSE LEAST(opens_at, earliest)
        END;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_episode_room_opens_at(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_episode_room_opens_at(uuid) TO service_role;

-- 休止の登録・変更・削除で、その日の放送枠のルームの開く時刻を計算し直す
CREATE OR REPLACE FUNCTION public.refresh_episode_rooms_for_override()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    room_id uuid;
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        FOR room_id IN
            SELECT DISTINCT episode_room_id FROM public.broadcast_room_sessions
             WHERE anime_id = OLD.anime_id AND room_date = OLD.room_date AND episode_room_id IS NOT NULL
        LOOP
            PERFORM public.refresh_episode_room_opens_at(room_id);
        END LOOP;
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        FOR room_id IN
            SELECT DISTINCT episode_room_id FROM public.broadcast_room_sessions
             WHERE anime_id = NEW.anime_id AND room_date = NEW.room_date AND episode_room_id IS NOT NULL
        LOOP
            PERFORM public.refresh_episode_room_opens_at(room_id);
        END LOOP;
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS broadcast_room_overrides_refresh_episode_rooms ON public.broadcast_room_overrides;
CREATE TRIGGER broadcast_room_overrides_refresh_episode_rooms
    AFTER INSERT OR UPDATE OF is_cancelled, anime_id, room_date OR DELETE
    ON public.broadcast_room_overrides
    FOR EACH ROW
    EXECUTE FUNCTION public.refresh_episode_rooms_for_override();

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
    opens timestamptz;
    today_jst date := (now() AT TIME ZONE 'Asia/Tokyo')::date;
BEGIN
    IF p_anime_id IS NULL OR p_episode_number IS NULL OR p_episode_number < 1 OR p_episode_number > 9999 THEN
        RETURN NULL;
    END IF;

    SELECT * INTO room
      FROM public.episode_rooms
     WHERE anime_id = p_anime_id AND kind = 'episode' AND episode_number = p_episode_number;
    IF FOUND THEN
        RETURN room.id;
    END IF;

    SELECT * INTO target_anime FROM public.anime WHERE id = p_anime_id;
    IF NOT FOUND
       OR (target_anime.hidden_by_admin AND NOT public.is_current_user_admin())
       OR target_anime.room_type = 'global'
       OR NOT (
           target_anime.type = 'TV'
           OR (target_anime.type IN ('ONA', 'OVA') AND COALESCE(target_anime.episode_total, 0) >= 2)
       )
       OR (target_anime.episode_total IS NOT NULL AND p_episode_number > target_anime.episode_total) THEN
        RETURN NULL;
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

-- 既存の休止日の放送枠を持つルームの開く時刻を計算し直す
SELECT public.refresh_episode_room_opens_at(room_id)
  FROM (
    SELECT DISTINCT s.episode_room_id AS room_id
      FROM public.broadcast_room_sessions s
      JOIN public.broadcast_room_overrides o
        ON o.anime_id = s.anime_id AND o.room_date = s.room_date AND o.is_cancelled
     WHERE s.episode_room_id IS NOT NULL
  ) rooms;
