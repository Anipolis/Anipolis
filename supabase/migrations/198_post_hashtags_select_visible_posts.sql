-- ================================================================
-- 198_post_hashtags_select_visible_posts.sql
-- 投稿とハッシュタグのつながりは、その投稿を読める人だけが読めるようにする。
--
-- post_hashtags の SELECT は 001 の USING (true) のままで、鍵アカウントの投稿・管理者が
-- 非表示にした投稿・BAN されたアカウントの投稿についても、投稿の ID と付いているタグを
-- 誰でも読めた。リポスト（062）と同じく、投稿の SELECT と同じ条件を付ける。
--
-- 投稿に埋め込んで読む経路（post_hashtags ( hashtags ( name ) )）とハッシュタグのページは、
-- もともと読める投稿だけを対象にしているので、見え方は変わらない。
-- トレンドの集計（get_trending_hashtags）は SECURITY DEFINER で、120 の条件のまま。
--
-- SELECT のポリシーは permissive で、複数あると OR になる。USING (true) が残ると効かないので、
-- SELECT のポリシーをすべて外してから作り直す。
-- ================================================================

DO $$
DECLARE
    policy_name text;
BEGIN
    FOR policy_name IN
        SELECT polname
        FROM pg_policy
        WHERE polrelid = 'public.post_hashtags'::regclass
          AND polcmd = 'r'
    LOOP
        EXECUTE format('DROP POLICY %I ON public.post_hashtags', policy_name);
    END LOOP;
END $$;

CREATE POLICY "post_hashtags_select_visible_posts"
    ON public.post_hashtags FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM public.posts p
            WHERE p.id = post_id
              AND public.can_view_profile_content(p.user_id)
              AND (NOT p.hidden_by_admin OR public.is_current_user_admin())
        )
    );
