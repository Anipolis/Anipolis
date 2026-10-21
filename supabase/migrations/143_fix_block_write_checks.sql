-- ============================================================
-- 143_fix_block_write_checks: 141 の返信・引用・ブックマークのブロック検査を直す
-- ============================================================
-- 141 の posts / bookmarks の INSERT ポリシーは
--   NOT EXISTS (SELECT 1 FROM posts parent WHERE parent.id = parent_id AND ...)
-- の形でブロック検査をしていたが、2つの理由で成立していなかった（PR #368 レビュー）。
--   1. サブクエリ内の無修飾 parent_id は挿入行ではなく parent.parent_id に解決される。
--   2. 列を直しても、サブクエリは呼び出し元の権限で posts を読むため、SELECT RLS が
--      ブロック相手の投稿を隠して0件になり、NOT EXISTS が真になる。
-- 結果として、ブロック前に知った投稿IDを指定すれば返信・引用・ブックマークができた。
--
-- SELECT RLS に依存しないよう、対象投稿の投稿者を SECURITY DEFINER で引いて判定する。

CREATE OR REPLACE FUNCTION public.is_blocked_with_post_author(target_post_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT CASE
        WHEN target_post_id IS NULL THEN false
        ELSE EXISTS (
            SELECT 1
            FROM public.posts p
            WHERE p.id = target_post_id
              AND public.is_blocked_between(auth.uid(), p.user_id)
        )
    END;
$$;

REVOKE ALL ON FUNCTION public.is_blocked_with_post_author(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_blocked_with_post_author(uuid) TO authenticated, service_role;

-- 返信・引用の相手。141 の posts_insert_active_users を helper に置き換える。
DROP POLICY IF EXISTS "posts_insert_active_users" ON public.posts;
CREATE POLICY "posts_insert_active_users"
    ON public.posts FOR INSERT
    WITH CHECK (
        auth.uid() = user_id
        AND public.is_profile_active_for_writes(user_id)
        AND public.has_beta_write_access()
        AND NOT public.is_blocked_with_post_author(parent_id)
        AND NOT public.is_blocked_with_post_author(quoted_post_id)
    );

-- ブックマーク。141 の bookmarks_insert_active_users を helper に置き換える。
DROP POLICY IF EXISTS "bookmarks_insert_active_users" ON public.bookmarks;
CREATE POLICY "bookmarks_insert_active_users" ON public.bookmarks
    FOR INSERT WITH CHECK (
        auth.uid() = user_id
        AND public.is_profile_active_for_writes(user_id)
        AND public.has_beta_write_access()
        AND NOT public.is_blocked_with_post_author(post_id)
    );

-- 返信通知。ポリシーで返信自体は止まるが、service role 等の経路でも
-- ブロック相手へ通知が飛ばないようトリガー側でも検査する。005 の定義 + ブロック検査。
CREATE OR REPLACE FUNCTION public.notify_on_reply()
RETURNS TRIGGER AS $$
DECLARE
    post_author_id UUID;
BEGIN
    -- parent_id がある投稿のみ (リプライ)
    IF NEW.parent_id IS NULL THEN
        RETURN NEW;
    END IF;
    SELECT user_id INTO post_author_id FROM public.posts WHERE id = NEW.parent_id;
    IF post_author_id IS NOT NULL
       AND post_author_id != NEW.user_id
       AND NOT public.is_blocked_between(NEW.user_id, post_author_id) THEN
        INSERT INTO public.notifications (recipient_id, actor_id, type, post_id)
        VALUES (post_author_id, NEW.user_id, 'reply', NEW.parent_id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
