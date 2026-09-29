-- ============================================================
-- 132_like_repost_notification_dedupe: いいね・リポスト通知の重複防止と取り消し時の削除（#286）
-- ============================================================
-- 005 の notify_on_like / notify_on_repost は likes / reposts への INSERT ごとに無条件で
-- 通知を作り、取り消し（DELETE）時には何もしない。toggleLikeAction は既存行があれば
-- DELETE、無ければ INSERT のトグルなので、付け外しを繰り返すと投稿者側に同じ相手からの
-- 通知が押した回数だけ積み上がり、取り消したあとも残る。
--
-- 対応（フォロー通知の 084、マイリスト通知の 126 と同じ方針）:
--   1. likes / reposts の AFTER DELETE で、対応する通知（同じ actor・post・type）を削除する。
--      既読・未読を問わず削除する: 取り消された操作の通知を残しても、通知から投稿を開いた
--      ときに「いいねが付いていない」不整合になるだけのため。
--   2. 未読の like / repost 通知は (recipient, actor, post, type) で一意にする部分ユニーク
--      インデックスを張り、通知トリガーは ON CONFLICT DO NOTHING で挿入する。
--      付け外しの往復では 1 → 削除 → 1 となり、未処理の通知は常に最大 1 件。
--   3. 既存データの整理: 取り消し済み（対応する likes / reposts 行が無い）通知と、
--      未読の重複通知（最古を残す）を削除してからインデックスを作る。

-- 移行中のリアクション操作を止める。likes / reposts を先にロックしないと、cleanup の後・
-- 削除トリガー設置の前に取り消しが commit され、その通知が残る（旧スキーマの取り消しは
-- notifications に触れないので notifications のロックでは遮れない）。
-- ロック順は通常の書き込み経路（likes/reposts → notifications）と同じにしてデッドロックを避ける。
LOCK TABLE public.likes IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.reposts IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.notifications IN SHARE ROW EXCLUSIVE MODE;

-- ---------- 3. 既存データの整理 ----------
-- 取り消し済みのいいね・リポストの通知
DELETE FROM public.notifications n
 WHERE n.type = 'like'
   AND NOT EXISTS (
       SELECT 1 FROM public.likes l
        WHERE l.post_id = n.post_id AND l.user_id = n.actor_id
   );

DELETE FROM public.notifications n
 WHERE n.type = 'repost'
   AND NOT EXISTS (
       SELECT 1 FROM public.reposts r
        WHERE r.post_id = n.post_id AND r.user_id = n.actor_id
   );

-- 未読の重複（同じ recipient・actor・post・type）は最古の 1 件を残す
DELETE FROM public.notifications duplicate
 USING public.notifications keeper
 WHERE duplicate.type IN ('like', 'repost')
   AND NOT duplicate.read
   AND keeper.type = duplicate.type
   AND NOT keeper.read
   AND duplicate.recipient_id = keeper.recipient_id
   AND duplicate.actor_id = keeper.actor_id
   AND duplicate.post_id = keeper.post_id
   AND (duplicate.created_at, duplicate.id) > (keeper.created_at, keeper.id);

-- ---------- 2. 未読の重複を DB で禁止 ----------
CREATE UNIQUE INDEX IF NOT EXISTS notifications_unread_reaction_dedupe_idx
    ON public.notifications (recipient_id, actor_id, post_id, type)
    WHERE type IN ('like', 'repost') AND NOT read;

CREATE OR REPLACE FUNCTION public.notify_on_like()
RETURNS TRIGGER AS $$
DECLARE
    post_author_id UUID;
BEGIN
    SELECT user_id INTO post_author_id FROM public.posts WHERE id = NEW.post_id;
    -- 自分自身へは通知しない。同じ相手からの未読通知が既にあれば増やさない
    IF post_author_id IS NOT NULL AND post_author_id != NEW.user_id THEN
        INSERT INTO public.notifications (recipient_id, actor_id, type, post_id)
        VALUES (post_author_id, NEW.user_id, 'like', NEW.post_id)
        ON CONFLICT (recipient_id, actor_id, post_id, type)
            WHERE type IN ('like', 'repost') AND NOT read
            DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.notify_on_repost()
RETURNS TRIGGER AS $$
DECLARE
    post_author_id UUID;
BEGIN
    SELECT user_id INTO post_author_id FROM public.posts WHERE id = NEW.post_id;
    IF post_author_id IS NOT NULL AND post_author_id != NEW.user_id THEN
        INSERT INTO public.notifications (recipient_id, actor_id, type, post_id)
        VALUES (post_author_id, NEW.user_id, 'repost', NEW.post_id)
        ON CONFLICT (recipient_id, actor_id, post_id, type)
            WHERE type IN ('like', 'repost') AND NOT read
            DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---------- 1. 取り消し時に通知を削除 ----------
CREATE OR REPLACE FUNCTION public.handle_unlike_delete_notification()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM public.notifications
     WHERE type = 'like'
       AND actor_id = OLD.user_id
       AND post_id = OLD.post_id;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_like_deleted ON public.likes;
CREATE TRIGGER on_like_deleted
    AFTER DELETE ON public.likes
    FOR EACH ROW EXECUTE FUNCTION public.handle_unlike_delete_notification();

CREATE OR REPLACE FUNCTION public.handle_unrepost_delete_notification()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM public.notifications
     WHERE type = 'repost'
       AND actor_id = OLD.user_id
       AND post_id = OLD.post_id;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_repost_deleted ON public.reposts;
CREATE TRIGGER on_repost_deleted
    AFTER DELETE ON public.reposts
    FOR EACH ROW EXECUTE FUNCTION public.handle_unrepost_delete_notification();
