-- ================================================================
-- 098_mylist_status_notifications.sql
-- 通知タイプに mylist_status（フォロー中ユーザーのマイリスト
-- ステータス変更）を追加する。
--
-- フォローしているユーザーが作品のステータスを
-- 「視聴予定 / 視聴中 / 完了」に変更（初回登録含む）した時、
-- そのフォロワー全員に通知を作成する。
-- 発信ユーザーのマイリストが非公開（profiles.list_is_public = false）
-- の場合は通知しない。
-- ================================================================

-- ----------------------------------------------------------------
-- カラム追加: どの作品をどのステータスにしたか
-- ----------------------------------------------------------------
ALTER TABLE public.notifications
    ADD COLUMN IF NOT EXISTS mylist_anime_id integer REFERENCES public.anime(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS mylist_status text;

-- ----------------------------------------------------------------
-- type の CHECK 制約に 'mylist_status' を追加
-- ----------------------------------------------------------------
ALTER TABLE public.notifications
    DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
    ADD CONSTRAINT notifications_type_check
    CHECK (type IN (
        'like',
        'repost',
        'reply',
        'mention',
        'follow',
        'follow_request',
        'anime_recommendation',
        'broadcast',
        'mylist_status'
    ));

-- ----------------------------------------------------------------
-- 未読取得高速化の部分インデックス（broadcast 用に倣う）
-- ----------------------------------------------------------------
CREATE INDEX IF NOT EXISTS notifications_unread_mylist_recipient_idx
    ON public.notifications (recipient_id, created_at DESC)
    WHERE type = 'mylist_status' AND NOT read;

-- ----------------------------------------------------------------
-- マイリストのステータス変更時にフォロワーへ通知するトリガー
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_on_mylist_status()
RETURNS TRIGGER AS $$
DECLARE
    list_public BOOLEAN;
BEGIN
    -- 対象ステータスは「視聴予定 / 視聴中 / 完了」のみ
    IF NEW.status NOT IN ('watching', 'completed', 'plan_to_watch') THEN
        RETURN NEW;
    END IF;

    -- UPDATE 時は status が実際に変化した場合のみ通知する
    -- （score / progress のみの更新では発火させない）
    IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
        RETURN NEW;
    END IF;

    -- 発信ユーザーのマイリストが非公開なら通知しない
    SELECT p.list_is_public INTO list_public
    FROM public.profiles p
    WHERE p.id = NEW.user_id;

    IF list_public IS DISTINCT FROM TRUE THEN
        RETURN NEW;
    END IF;

    -- フォロワー全員へファンアウト
    INSERT INTO public.notifications
        (recipient_id, actor_id, type, mylist_anime_id, mylist_status)
    SELECT f.follower_id, NEW.user_id, 'mylist_status', NEW.anime_id, NEW.status
    FROM public.follows f
    WHERE f.following_id = NEW.user_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_mylist_status_notify ON public.user_anime_list;

CREATE TRIGGER on_mylist_status_notify
    AFTER INSERT OR UPDATE OF status ON public.user_anime_list
    FOR EACH ROW EXECUTE FUNCTION public.notify_on_mylist_status();
