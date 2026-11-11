-- ================================================================
-- 199_post_reply_quote_visible_target.sql
-- 返信・引用は、相手の投稿を読める人だけができるようにする。
--
-- posts の INSERT ポリシー（143）は、返信先・引用元についてブロックだけを見ていた。
-- 投稿の ID さえ分かれば、鍵アカウントの投稿や、管理者が非表示にした投稿にも返信・引用でき、
-- 返信は相手に通知された。通るかどうかで、その ID の投稿があるかも確かめられた。
--
-- 返信先・引用元が、呼んだ人の権限で読めること（posts の SELECT ポリシーを通ること）を条件に足す。
-- 141 のようにポリシーの中へ副問い合わせを直接書くと、無修飾の parent_id が副問い合わせ側の
-- 列に解決されてしまう（143 のコメント参照）ので、関数にして引数で渡す。
-- 読めない投稿と、存在しない投稿は、どちらも同じ RLS の違反になる
-- （外部キーの検査より先にポリシーの検査で止まる）。
--
-- INSERT のポリシーは permissive で、複数あると OR になる。別のポリシーが残っていると
-- 効かないので、posts の INSERT ポリシーをすべて外してから作り直す。そのほかの条件は 143 のまま。
-- ================================================================

CREATE OR REPLACE FUNCTION public.can_view_post(target_post_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT target_post_id IS NULL
        OR EXISTS (
            SELECT 1
            FROM public.posts p
            WHERE p.id = target_post_id
        );
$$;

REVOKE ALL ON FUNCTION public.can_view_post(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_post(uuid) TO authenticated, service_role;

DO $$
DECLARE
    policy_name text;
BEGIN
    FOR policy_name IN
        SELECT polname
        FROM pg_policy
        WHERE polrelid = 'public.posts'::regclass
          AND polcmd = 'a'
    LOOP
        EXECUTE format('DROP POLICY %I ON public.posts', policy_name);
    END LOOP;
END $$;

CREATE POLICY "posts_insert_active_users"
    ON public.posts FOR INSERT
    WITH CHECK (
        auth.uid() = user_id
        AND public.is_profile_active_for_writes(user_id)
        AND public.has_beta_write_access()
        AND NOT public.is_blocked_with_post_author(parent_id)
        AND NOT public.is_blocked_with_post_author(quoted_post_id)
        AND public.can_view_post(parent_id)
        AND public.can_view_post(quoted_post_id)
    );
