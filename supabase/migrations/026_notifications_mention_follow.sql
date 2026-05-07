-- ================================================================
-- 026_notifications_mention_follow.sql
-- 通知タイプに mention（メンション）と follow（フォロー）を追加
-- ================================================================

-- post_id を NULL 許容に変更（フォロー通知はポストを持たない）
ALTER TABLE public.notifications
    ALTER COLUMN post_id DROP NOT NULL;

-- type の CHECK 制約を更新して mention と follow を追加
ALTER TABLE public.notifications
    DROP CONSTRAINT notifications_type_check;

ALTER TABLE public.notifications
    ADD CONSTRAINT notifications_type_check
    CHECK (type IN ('like', 'repost', 'reply', 'mention', 'follow'));

-- ----------------------------------------------------------------
-- フォロー時に通知を作成するトリガー
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_on_follow()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.notifications (recipient_id, actor_id, type, post_id)
    VALUES (NEW.following_id, NEW.follower_id, 'follow', NULL);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_follow_notify
    AFTER INSERT ON public.follows
    FOR EACH ROW EXECUTE FUNCTION public.notify_on_follow();

-- ----------------------------------------------------------------
-- メンション時に通知を作成するトリガー
-- posts.content から @username パターンを検出して通知する
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_on_mention()
RETURNS TRIGGER AS $$
DECLARE
    mentioned_username TEXT;
    mentioned_user_id  UUID;
BEGIN
    FOR mentioned_username IN
        SELECT DISTINCT (regexp_matches(NEW.content, '@([A-Za-z0-9_]+)', 'g'))[1]
    LOOP
        SELECT id INTO mentioned_user_id
        FROM public.profiles
        WHERE username = mentioned_username;

        -- 存在するユーザーかつ自分自身でなければ通知
        IF mentioned_user_id IS NOT NULL AND mentioned_user_id != NEW.user_id THEN
            INSERT INTO public.notifications (recipient_id, actor_id, type, post_id)
            VALUES (mentioned_user_id, NEW.user_id, 'mention', NEW.id);
        END IF;
    END LOOP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_mention_notify
    AFTER INSERT ON public.posts
    FOR EACH ROW EXECUTE FUNCTION public.notify_on_mention();
