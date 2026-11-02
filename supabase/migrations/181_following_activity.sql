-- ============================================================
-- 181_following_activity: タイムラインの「アクティビティ」（フォロー中の人のマイリストの動き）
-- ============================================================
-- これまでは、フォロー中の人がマイリストのステータスを変えるたびに、フォロワー全員へ通知の行を
-- 作っていた（110 の notify_on_mylist_status）。人の動きは自分宛ての知らせではないので、
-- 通知ではなくタイムラインの「アクティビティ」タブに流す。
--
-- 方針:
--   * 出来事を1件1行で残す（mylist_activities）。フォロワーごとには作らず、見る時点でフォロー中の人の
--     行を読む。後からフォローした人にも最近の動きが見え、フォローを外せば見えなくなる。
--   * 残すのは「視聴予定・視聴中・完了」にしたとき（110 と同じ）。そのときのスコアも一緒に残す。
--   * スコアだけを変えた保存では行を作らず、その作品の直近の記録が同じステータスで24時間以内なら、
--     そのスコアを書き換える（「完了にして、少し後でスコアを付けた」を1行にまとめる）。
--   * 30分以内にステータスを付け直した（選び間違いの直しなど）ときは、まだいいねが無ければ前の記録を
--     書き換える。いいねが付いた記録は書き換えない（何にいいねしたかが変わってしまう）。
--   * 見える人はマイリストと同じ（119: 本人、または公開リストを投稿と同じ相手に）。公開設定を変えれば
--     過去の記録にもすぐ効く。マイリストから外したら、その作品の記録も消える。
--   * 記録には、いいね（mylist_activity_likes）を付けられる。記録の持ち主へ通知（activity_like）する。
--     いいねは他人に見える書き込みなので、130 の方針どおり β権限とアカウント状態を求める。
--   * 110 の通知は作らなくする。今までの mylist_status の通知の行と列は残す（アプリの切り替え前に
--     この migration を流しても、今の画面が壊れないように）。片付けは後で別に行う。

CREATE TABLE IF NOT EXISTS public.mylist_activities (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    anime_id   bigint      NOT NULL REFERENCES public.anime(id) ON DELETE CASCADE,
    status     text        NOT NULL,
    score      smallint,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT mylist_activities_entry_fkey
        FOREIGN KEY (user_id, anime_id)
        REFERENCES public.user_anime_list (user_id, anime_id)
        ON DELETE CASCADE,
    CONSTRAINT mylist_activities_status_check CHECK (status IN ('plan_to_watch', 'watching', 'completed')),
    CONSTRAINT mylist_activities_score_range CHECK (score IS NULL OR score BETWEEN 1 AND 10)
);

-- タイムラインの読み出し（フォロー中の人ごとに新しい順）と、トリガーの「その作品の直近の記録」
CREATE INDEX IF NOT EXISTS mylist_activities_user_created_idx
    ON public.mylist_activities (user_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS mylist_activities_entry_created_idx
    ON public.mylist_activities (user_id, anime_id, created_at DESC);

ALTER TABLE public.mylist_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mylist_activities: マイリストが見える相手だけ読める" ON public.mylist_activities;
CREATE POLICY "mylist_activities: マイリストが見える相手だけ読める"
    ON public.mylist_activities FOR SELECT
    USING (
        auth.uid() = user_id
        OR (
            public.can_view_profile_content(user_id)
            AND EXISTS (
                SELECT 1 FROM public.profiles p
                WHERE p.id = mylist_activities.user_id AND p.list_is_public = true
            )
        )
    );

-- 書き込みはトリガーだけが行う（クライアントには INSERT/UPDATE/DELETE を許さない）
-- プロフィールのアクティビティのタブは、ログインしていない人にも公開のマイリストと同じ範囲で見せる
REVOKE ALL ON public.mylist_activities FROM anon, authenticated;
GRANT SELECT ON public.mylist_activities TO anon, authenticated;

-- ---------- マイリストの保存から記録を作る ----------
CREATE OR REPLACE FUNCTION public.record_mylist_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    latest public.mylist_activities%ROWTYPE;
BEGIN
    IF NEW.status NOT IN ('plan_to_watch', 'watching', 'completed') THEN
        RETURN NEW;
    END IF;

    SELECT * INTO latest
    FROM public.mylist_activities
    WHERE user_id = NEW.user_id AND anime_id = NEW.anime_id
    ORDER BY created_at DESC, id DESC
    LIMIT 1;

    IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
        IF latest.id IS NOT NULL
           AND latest.created_at > now() - interval '30 minutes'
           AND NOT EXISTS (SELECT 1 FROM public.mylist_activity_likes l WHERE l.activity_id = latest.id)
        THEN
            UPDATE public.mylist_activities
            SET status = NEW.status, score = NEW.score, created_at = now()
            WHERE id = latest.id;
        ELSE
            INSERT INTO public.mylist_activities (user_id, anime_id, status, score)
            VALUES (NEW.user_id, NEW.anime_id, NEW.status, NEW.score);
        END IF;
    ELSIF NEW.score IS DISTINCT FROM OLD.score
          AND latest.id IS NOT NULL
          AND latest.status = NEW.status
          AND latest.created_at > now() - interval '24 hours'
    THEN
        UPDATE public.mylist_activities SET score = NEW.score WHERE id = latest.id;
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.record_mylist_activity() FROM PUBLIC, anon, authenticated;

-- ---------- いいね ----------
CREATE TABLE IF NOT EXISTS public.mylist_activity_likes (
    activity_id uuid        NOT NULL REFERENCES public.mylist_activities(id) ON DELETE CASCADE,
    user_id     uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (activity_id, user_id)
);

CREATE INDEX IF NOT EXISTS mylist_activity_likes_user_idx
    ON public.mylist_activity_likes (user_id, activity_id);

ALTER TABLE public.mylist_activity_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mylist_activity_likes: 記録が見える相手だけ読める" ON public.mylist_activity_likes;
CREATE POLICY "mylist_activity_likes: 記録が見える相手だけ読める"
    ON public.mylist_activity_likes FOR SELECT
    USING (EXISTS (SELECT 1 FROM public.mylist_activities a WHERE a.id = mylist_activity_likes.activity_id));

DROP POLICY IF EXISTS "mylist_activity_likes: 本人が見える記録にだけ付けられる" ON public.mylist_activity_likes;
CREATE POLICY "mylist_activity_likes: 本人が見える記録にだけ付けられる"
    ON public.mylist_activity_likes FOR INSERT
    WITH CHECK (
        auth.uid() = user_id
        AND public.has_beta_write_access()
        AND public.is_profile_active_for_writes(user_id)
        AND EXISTS (SELECT 1 FROM public.mylist_activities a WHERE a.id = mylist_activity_likes.activity_id)
    );

DROP POLICY IF EXISTS "mylist_activity_likes: 本人だけ外せる" ON public.mylist_activity_likes;
CREATE POLICY "mylist_activity_likes: 本人だけ外せる"
    ON public.mylist_activity_likes FOR DELETE
    USING (auth.uid() = user_id);

REVOKE ALL ON public.mylist_activity_likes FROM anon, authenticated;
GRANT SELECT ON public.mylist_activity_likes TO anon;
GRANT SELECT, INSERT, DELETE ON public.mylist_activity_likes TO authenticated;

-- 記録のトリガーは、いいねの表を参照するので表を作った後に付ける
DROP TRIGGER IF EXISTS record_mylist_activity ON public.user_anime_list;
CREATE TRIGGER record_mylist_activity
    AFTER INSERT OR UPDATE OF status, score ON public.user_anime_list
    FOR EACH ROW EXECUTE FUNCTION public.record_mylist_activity();

-- ---------- いいねの通知 ----------
ALTER TABLE public.notifications
    ADD COLUMN IF NOT EXISTS activity_id uuid REFERENCES public.mylist_activities(id) ON DELETE CASCADE;

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
        'mylist_status',
        'exchange_matched',
        'activity_like'
    ));

-- 同じ相手から同じ記録へのいいねは、未読のうちは1件だけ（132 の like / repost と同じ）
CREATE UNIQUE INDEX IF NOT EXISTS notifications_unread_activity_like_dedupe_idx
    ON public.notifications (recipient_id, actor_id, activity_id)
    WHERE type = 'activity_like' AND NOT read;

CREATE OR REPLACE FUNCTION public.notify_on_activity_like()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    owner_id uuid;
BEGIN
    SELECT user_id INTO owner_id FROM public.mylist_activities WHERE id = NEW.activity_id;
    IF owner_id IS NOT NULL
       AND owner_id <> NEW.user_id
       AND NOT public.is_blocked_between(owner_id, NEW.user_id)
    THEN
        INSERT INTO public.notifications (recipient_id, actor_id, type, activity_id)
        VALUES (owner_id, NEW.user_id, 'activity_like', NEW.activity_id)
        ON CONFLICT (recipient_id, actor_id, activity_id)
            WHERE type = 'activity_like' AND NOT read
            DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_activity_unlike_delete_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    DELETE FROM public.notifications
    WHERE type = 'activity_like'
      AND actor_id = OLD.user_id
      AND activity_id = OLD.activity_id;
    RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_on_activity_like() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_activity_unlike_delete_notification() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_activity_like_notify ON public.mylist_activity_likes;
CREATE TRIGGER on_activity_like_notify
    AFTER INSERT ON public.mylist_activity_likes
    FOR EACH ROW EXECUTE FUNCTION public.notify_on_activity_like();

DROP TRIGGER IF EXISTS on_activity_like_deleted ON public.mylist_activity_likes;
CREATE TRIGGER on_activity_like_deleted
    AFTER DELETE ON public.mylist_activity_likes
    FOR EACH ROW EXECUTE FUNCTION public.handle_activity_unlike_delete_notification();

-- ---------- フォロー中の人の記録を新しい順に読む ----------
-- 呼び出した人の権限で動かす（記録の RLS がそのまま効く）。並びと続きの目印は 127 の
-- get_following_timeline と同じ（作成日時, ID）の降順
CREATE OR REPLACE FUNCTION public.get_following_activity(
    p_limit integer DEFAULT 50,
    p_before timestamptz DEFAULT NULL,
    p_before_id uuid DEFAULT NULL
)
RETURNS TABLE (activity_id uuid, created_at timestamptz)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT a.id, a.created_at
    FROM public.follows f
    JOIN public.mylist_activities a ON a.user_id = f.following_id
    WHERE f.follower_id = auth.uid()
      AND (
          p_before IS NULL
          OR a.created_at < p_before
          OR (p_before_id IS NOT NULL AND a.created_at = p_before AND a.id < p_before_id)
      )
    ORDER BY a.created_at DESC, a.id DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
$$;

REVOKE ALL ON FUNCTION public.get_following_activity(integer, timestamptz, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_following_activity(integer, timestamptz, uuid) TO authenticated;

-- ---------- 110 の通知をやめる ----------
DROP TRIGGER IF EXISTS on_mylist_status_notify ON public.user_anime_list;
