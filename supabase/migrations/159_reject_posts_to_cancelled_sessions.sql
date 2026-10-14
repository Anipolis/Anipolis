-- ============================================================
-- 159_reject_posts_to_cancelled_sessions: 休止日の放送枠を直接指定した投稿を拒否する（#390）
-- ============================================================
-- 061 の enforce_broadcast_room_post_window() は受付時間と作品しか見ないため、休止
-- （broadcast_room_overrides.is_cancelled）した放送日の放送枠を REST で直接指定すると投稿できた。
-- 投稿は話数ルームに紐づくが、日付のルームは休止日を 404 にするので、見えない場所に投稿が残る。
-- 158 の assign_post_episode_room() の放送枠指定の分岐で、新しい投稿だけ休止を確かめて拒否する
-- （管理者の付け替えなどの UPDATE は対象外。ほかは 158 と同じ）。

CREATE OR REPLACE FUNCTION public.assign_post_episode_room()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    session_room_id uuid;
    session_anime_id integer;
    session_room_date date;
    target_room public.episode_rooms%ROWTYPE;
    live_session_id uuid;
BEGIN
    -- 放送枠を指定した投稿（今のアプリ）: 放送枠の話数ルームを補う
    IF NEW.broadcast_room_session_id IS NOT NULL THEN
        SELECT episode_room_id, anime_id, room_date
          INTO session_room_id, session_anime_id, session_room_date
          FROM public.broadcast_room_sessions
         WHERE id = NEW.broadcast_room_session_id;

        -- 休止した放送日の放送枠への新しい投稿は拒否する（#390）。日付のルームは休止日を 404 にするので、
        -- REST を直接呼んで放送枠を指定した場合だけここに来る
        IF TG_OP = 'INSERT'
           AND session_anime_id IS NOT NULL
           AND public.is_broadcast_room_session_cancelled(session_anime_id, session_room_date) THEN
            RAISE EXCEPTION 'Broadcast room session is cancelled' USING ERRCODE = 'check_violation';
        END IF;

        IF NEW.episode_room_id IS NULL THEN
            NEW.episode_room_id := session_room_id;
        ELSIF NEW.episode_room_id IS DISTINCT FROM session_room_id THEN
            -- 話数ルームの無い放送枠（総合ロビーなど）に話数ルームを併記した投稿も拒否する
            -- （併記した話数ルームの開場・統合・作品の検査を素通りさせない）
            RAISE EXCEPTION 'Post room does not match its broadcast room session'
                USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.episode_room_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- 話数ルームを直接指定した投稿（新しいアプリ）
    -- 統合（merge_episode_rooms）と並行しないよう、ルームの行を共有ロックしてから読む（158）。
    -- 統合中なら終わるのを待ち、統合済みになったルームへの投稿は下の検査で拒否する
    SELECT * INTO target_room FROM public.episode_rooms WHERE id = NEW.episode_room_id FOR SHARE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invalid episode room for post' USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.anime_id IS NULL THEN
        NEW.anime_id := target_room.anime_id;
    ELSIF NEW.anime_id <> target_room.anime_id THEN
        RAISE EXCEPTION 'Invalid episode room for post' USING ERRCODE = 'check_violation';
    END IF;

    -- 管理者が非表示にした作品のルームには投稿させない（#387 Codex）
    IF TG_OP = 'INSERT'
       AND EXISTS (SELECT 1 FROM public.anime a WHERE a.id = target_room.anime_id AND a.hidden_by_admin)
       AND NOT public.is_current_user_admin() THEN
        RAISE EXCEPTION 'Episode room is not accepting posts' USING ERRCODE = 'check_violation';
    END IF;

    -- 新しい投稿だけ、ルームが開いているかを確かめる（管理者の付け替えなどの UPDATE は対象外）
    IF TG_OP = 'INSERT' THEN
        IF target_room.merged_into IS NOT NULL
           OR target_room.opens_at IS NULL
           OR target_room.opens_at > clock_timestamp() THEN
            RAISE EXCEPTION 'Episode room is not accepting posts' USING ERRCODE = 'check_violation';
        END IF;

        -- 放送枠の時間内なら、その放送枠の投稿としても記録する（画面の見出し・話数の訂正で使う）
        SELECT id INTO live_session_id
          FROM public.broadcast_room_sessions
         WHERE episode_room_id = NEW.episode_room_id
           AND posting_opens_at <= clock_timestamp()
           AND posting_closes_at >= clock_timestamp()
           -- 休止した放送枠には付けない（156。日付のルームは休止日を 404 にするため）
           AND NOT public.is_broadcast_room_session_cancelled(anime_id, room_date)
         ORDER BY posting_opens_at DESC
         LIMIT 1;
        NEW.broadcast_room_session_id := live_session_id;
    END IF;

    RETURN NEW;
END;
$$;
