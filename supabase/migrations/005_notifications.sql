-- ================================================================
-- 005_notifications.sql
-- 通知機能: いいね・リポスト・リプライを通知テーブルに記録する
-- ================================================================

-- notifications テーブル
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_id UUID NOT NULL,
    actor_id UUID NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('like', 'repost', 'reply')),
    post_id UUID NOT NULL,
    read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT notifications_recipient_id_fkey
        FOREIGN KEY (recipient_id) REFERENCES profiles(id) ON DELETE CASCADE,
    CONSTRAINT notifications_actor_id_fkey
        FOREIGN KEY (actor_id) REFERENCES profiles(id) ON DELETE CASCADE,
    CONSTRAINT notifications_post_id_fkey
        FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
);

CREATE INDEX notifications_recipient_id_idx ON notifications(recipient_id);
CREATE INDEX notifications_created_at_idx ON notifications(created_at DESC);

-- RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
    ON notifications FOR SELECT
    USING (recipient_id = auth.uid());

CREATE POLICY "Users can update own notifications"
    ON notifications FOR UPDATE
    USING (recipient_id = auth.uid());

-- ----------------------------------------------------------------
-- いいね時に通知を作成するトリガー
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION notify_on_like()
RETURNS TRIGGER AS $$
DECLARE
    post_author_id UUID;
BEGIN
    SELECT user_id INTO post_author_id FROM posts WHERE id = NEW.post_id;
    -- 自分自身へは通知しない
    IF post_author_id IS NOT NULL AND post_author_id != NEW.user_id THEN
        INSERT INTO notifications (recipient_id, actor_id, type, post_id)
        VALUES (post_author_id, NEW.user_id, 'like', NEW.post_id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_like_notify
    AFTER INSERT ON likes
    FOR EACH ROW EXECUTE FUNCTION notify_on_like();

-- ----------------------------------------------------------------
-- リポスト時に通知を作成するトリガー
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION notify_on_repost()
RETURNS TRIGGER AS $$
DECLARE
    post_author_id UUID;
BEGIN
    SELECT user_id INTO post_author_id FROM posts WHERE id = NEW.post_id;
    IF post_author_id IS NOT NULL AND post_author_id != NEW.user_id THEN
        INSERT INTO notifications (recipient_id, actor_id, type, post_id)
        VALUES (post_author_id, NEW.user_id, 'repost', NEW.post_id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_repost_notify
    AFTER INSERT ON reposts
    FOR EACH ROW EXECUTE FUNCTION notify_on_repost();

-- ----------------------------------------------------------------
-- リプライ時に通知を作成するトリガー
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION notify_on_reply()
RETURNS TRIGGER AS $$
DECLARE
    post_author_id UUID;
BEGIN
    -- parent_id がある投稿のみ (リプライ)
    IF NEW.parent_id IS NULL THEN
        RETURN NEW;
    END IF;
    SELECT user_id INTO post_author_id FROM posts WHERE id = NEW.parent_id;
    IF post_author_id IS NOT NULL AND post_author_id != NEW.user_id THEN
        INSERT INTO notifications (recipient_id, actor_id, type, post_id)
        VALUES (post_author_id, NEW.user_id, 'reply', NEW.parent_id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_reply_notify
    AFTER INSERT ON posts
    FOR EACH ROW EXECUTE FUNCTION notify_on_reply();
