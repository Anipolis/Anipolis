-- ================================================================
-- 209_episode_bounds_without_total.sql
-- 話数（episode_total）が空の放送中作品でも、話数ルームのシーズンの範囲を出す（#597）
--
-- 186 の episode_room_bounds は episode_total >= 1 のときだけシーズンの範囲を返していた。
-- 分割2クールの第2クールのように、どのソースにも話数が無い作品では範囲が NULL になり、
-- 作品ページの話数一覧が第1話から（通算の第40話からの作品でも第1〜39話まで）並んでいた。
--
-- 話数が空のときは、放送開始の週（aired_from の前日〜6日後）の初回放送の枠の話数が 2 以上なら、
-- それをシーズンの始まり、今あるルームと放送枠（予定を含む）の最大の話数をシーズンの終わりにする。
-- 手がかりは放送開始の週の枠だけにする（途中の週から取り込んだ作品で、始まりを後ろにずらさないため）。
-- 話数が入っている作品の計算・開ける話数の計算は 186 のまま。
-- ================================================================

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
    max_session_episode integer;
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
    -- 話数が空でも、放送開始の週の放送枠から手がかりを取る（209、#597）ので、ルームと放送枠は先に読む
    BEGIN
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
    END;

    IF COALESCE(target_anime.episode_total, 0) >= 1 THEN
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
    ELSIF anchored AND first_airing_number > 1 THEN
        -- 話数がまだ決まっていない放送中の通算の作品（分割2クールの第2クールなど）。
        -- 放送開始の週の話数から始め、終わりは今あるルームと放送枠（予定を含む）の最大まで。
        -- ensure_episode_room は season_last を超える話数を作らないので、放送されたばかりで
        -- ルームがまだ無い話も入るよう、放送枠の話数も見る（話数が入れば上の分岐に移る）
        SELECT max(s.episode_number) INTO max_session_episode
          FROM public.broadcast_room_sessions s
         WHERE s.anime_id = p_anime_id
           AND s.room_kind = 'episode'
           AND s.episode_number IS NOT NULL
           AND NOT public.is_broadcast_room_session_cancelled(s.anime_id, s.room_date);
        season_first := first_airing_number;
        season_last := GREATEST(first_airing_number, COALESCE(max_room_number, 0), COALESCE(max_session_episode, 0));
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
