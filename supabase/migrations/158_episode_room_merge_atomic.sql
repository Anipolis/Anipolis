-- ============================================================
-- 158_episode_room_merge_atomic: 話数ルームの統合を1回の操作にする（#395 の Codex レビュー）
-- ============================================================
-- 管理画面の統合は「投稿を移す → 統合元に merged_into を付ける」を別々に実行していたため、
--   * その間に統合元へ投稿されると、その投稿だけ統合元に残り、元の URL が統合先へ転送されて見えなくなる
--   * 後の更新が失敗すると、投稿だけ移って統合元が有効なまま残る
-- 統合を merge_episode_rooms() の1回のトランザクションにし、投稿のトリガーはルームの行を共有ロックして
-- 読む（統合中の投稿は終わるのを待ち、統合済みのルームへの投稿は拒否される）。
-- 開く時刻の固定を外す操作も、外すことと放送枠からの計算し直しを1回にする。

CREATE OR REPLACE FUNCTION public.assign_post_episode_room()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    session_room_id uuid;
    target_room public.episode_rooms%ROWTYPE;
    live_session_id uuid;
BEGIN
    -- 放送枠を指定した投稿（今のアプリ）: 放送枠の話数ルームを補う
    IF NEW.broadcast_room_session_id IS NOT NULL THEN
        SELECT episode_room_id INTO session_room_id
          FROM public.broadcast_room_sessions
         WHERE id = NEW.broadcast_room_session_id;

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

CREATE OR REPLACE FUNCTION public.merge_episode_rooms(p_source uuid, p_target uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    source_room public.episode_rooms%ROWTYPE;
    target_room public.episode_rooms%ROWTYPE;
    moved integer;
BEGIN
    IF p_source IS NULL OR p_target IS NULL OR p_source = p_target THEN
        RAISE EXCEPTION 'invalid rooms to merge' USING ERRCODE = '22023';
    END IF;

    -- 両方の行をロックしてから確かめる（並行する投稿・統合を待たせる）
    PERFORM 1 FROM public.episode_rooms WHERE id IN (p_source, p_target) ORDER BY id FOR UPDATE;
    SELECT * INTO source_room FROM public.episode_rooms WHERE id = p_source;
    SELECT * INTO target_room FROM public.episode_rooms WHERE id = p_target;

    IF source_room.id IS NULL OR target_room.id IS NULL
       OR source_room.anime_id <> target_room.anime_id
       OR source_room.merged_into IS NOT NULL OR target_room.merged_into IS NOT NULL THEN
        RAISE EXCEPTION 'rooms cannot be merged' USING ERRCODE = '22023';
    END IF;

    -- 放送枠のあるルームは、放送枠の話数を直す（話数の訂正）ことで移す
    IF EXISTS (SELECT 1 FROM public.broadcast_room_sessions WHERE episode_room_id = p_source) THEN
        RAISE EXCEPTION 'source room has airings' USING ERRCODE = '22023';
    END IF;

    -- 先に統合済みにする（同じトランザクションの中なので、投稿の移動と一緒に確定する）
    UPDATE public.episode_rooms SET merged_into = p_target WHERE id = p_source;
    UPDATE public.posts SET episode_room_id = p_target WHERE episode_room_id = p_source;
    GET DIAGNOSTICS moved = ROW_COUNT;
    RETURN moved;
END;
$$;

REVOKE ALL ON FUNCTION public.merge_episode_rooms(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_episode_rooms(uuid, uuid) TO service_role;

-- 開く時刻の固定を外し、放送枠から計算し直す（放送枠が無ければ開く時刻はそのまま）
CREATE OR REPLACE FUNCTION public.unlock_episode_room_opens_at(p_room_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.episode_rooms SET opens_at_locked = false WHERE id = p_room_id;
    PERFORM public.refresh_episode_room_opens_at(p_room_id);
END;
$$;

REVOKE ALL ON FUNCTION public.unlock_episode_room_opens_at(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.unlock_episode_room_opens_at(uuid) TO service_role;
