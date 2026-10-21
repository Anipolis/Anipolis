-- ============================================================
-- 171_event_room_post_guard: イベントルームへの投稿を DB でも検査する（#238）
-- ============================================================
-- イベントルームの投稿（/events/[id] の createPost）は、イベントの中止・投稿の受付時間・作品を画面側で
-- 確かめている。しかし posts の INSERT ポリシーは event_id を見ないので、Supabase の REST API に直接
-- INSERT すれば、開催前・終了後・中止したイベントへの投稿や、イベントと違う作品の投稿を作れた。
-- 放送回ルーム・話数ルームと同時に指定することもできた。
--
-- 利用者（anon / authenticated）からの、event_id を持つ投稿の INSERT と、event_id・作品・ルームの変更で
-- 次を確かめる。違えば SQLSTATE 22023（PostgREST は 400）で拒否し、HINT に画面に出す文言を入れる。
--   * 放送回ルーム（broadcast_room_session_id）・話数ルーム（episode_room_id）と同時に指定しない
--   * イベントがあり、中止されていない
--   * 投稿の作品（anime_id）がイベントの作品と同じ（作品の無いイベントなら投稿も作品なし）
--   * 投稿の受付時間内: scheduled_at から scheduled_at + duration_minutes（未設定なら 360 分。
--     画面の DEFAULT_EVENT_DURATION_MINUTES と同じ）まで。INSERT と event_id の付け替えのときだけ見る
-- service role（管理用のスクリプト）からの書き込みはそのまま通す。
-- posts を UPDATE できるのは管理者だけ（058）で、モデレーションは event_id などを変えないので、このトリガーは動かない。
--   * 本番の既存データ: イベントへの投稿は 0 件（2026-10-21 確認）

CREATE OR REPLACE FUNCTION public.enforce_event_room_post()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    target_event record;
BEGIN
    IF NEW.event_id IS NULL OR COALESCE(auth.role(), '') NOT IN ('anon', 'authenticated') THEN
        RETURN NEW;
    END IF;

    IF NEW.broadcast_room_session_id IS NOT NULL OR NEW.episode_room_id IS NOT NULL THEN
        RAISE EXCEPTION 'event_post_room_conflict'
            USING ERRCODE = '22023',
                  HINT = 'イベントの投稿は、放送回のルームや話数のルームと同時には投稿できません';
    END IF;

    SELECT e.anime_id, e.scheduled_at, e.duration_minutes, e.is_cancelled
      INTO target_event
      FROM public.events AS e
     WHERE e.id = NEW.event_id;

    IF NOT FOUND OR target_event.is_cancelled THEN
        RAISE EXCEPTION 'event_not_open'
            USING ERRCODE = '22023',
                  HINT = 'イベントが見つかりません';
    END IF;

    IF NEW.anime_id IS DISTINCT FROM target_event.anime_id THEN
        RAISE EXCEPTION 'event_post_anime_mismatch'
            USING ERRCODE = '22023',
                  HINT = 'イベントの作品と違う作品では投稿できません';
    END IF;

    IF TG_OP = 'INSERT' OR NEW.event_id IS DISTINCT FROM OLD.event_id THEN
        IF now() < target_event.scheduled_at THEN
            RAISE EXCEPTION 'event_post_not_started'
                USING ERRCODE = '22023',
                      HINT = 'このイベントはまだ投稿を受け付けていません';
        END IF;
        IF now() > target_event.scheduled_at
                   + make_interval(mins => COALESCE(target_event.duration_minutes, 360)) THEN
            RAISE EXCEPTION 'event_post_closed'
                USING ERRCODE = '22023',
                      HINT = 'このイベントの投稿受付は終了しました';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_event_room_post() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_event_room_post ON public.posts;
CREATE TRIGGER enforce_event_room_post
    BEFORE INSERT OR UPDATE OF event_id, anime_id, broadcast_room_session_id, episode_room_id ON public.posts
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_event_room_post();
