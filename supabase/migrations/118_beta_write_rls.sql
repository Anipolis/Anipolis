-- クローズドβの資格検査をDB層（RLS）にも適用する。
--
-- これまでβゲートは SvelteKit の hooks.server.ts でしか適用されておらず、
-- 公開 Supabase URL + publishable key で直接サインアップしたユーザーが
-- REST API 経由で投稿・いいね・フォロー等を実行できた（Codex監査 P1-1）。
-- 招待フロー上 signup 自体は無効化できないため、書き込み系 RLS ポリシーに
-- 「βメンバーまたは管理者」の条件を追加して直接アクセスを遮断する。
--
-- β終了時（一般公開時）の締め出しを防ぐため、判定は app_config テーブルの
-- closed_beta フラグで切り替えられるようにする。一般公開する際は
--   UPDATE public.app_config SET value = 'false'::jsonb WHERE key = 'closed_beta';
-- を実行すること（PUBLIC_CLOSED_BETA 環境変数の無効化とセットで行う）。
-- ローカル開発でβゲートを外している場合も同じ UPDATE を実行する。

-- ----------------------------------------------------------------
-- 1. アプリ全体設定テーブル（サーバー管理者のみ書き込み可）
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_config (
    key   text PRIMARY KEY,
    value jsonb NOT NULL
);

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_config: 誰でも読める" ON public.app_config;
CREATE POLICY "app_config: 誰でも読める"
    ON public.app_config FOR SELECT USING (true);
-- INSERT/UPDATE/DELETE ポリシーは意図的に作らない（service_role のみ書き込み可）。

INSERT INTO public.app_config (key, value)
VALUES ('closed_beta', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ----------------------------------------------------------------
-- 2. β資格判定関数
-- ----------------------------------------------------------------
-- closed_beta が無効なら常に true。有効なら JWT の app_metadata.beta_member
-- または管理者のみ true。SECURITY DEFINER は app_config の将来的な
-- RLS 変更に依存しないための保険（現状 SELECT は公開）。
CREATE OR REPLACE FUNCTION public.has_beta_write_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        NOT COALESCE(
            (SELECT (value #>> '{}')::boolean FROM public.app_config WHERE key = 'closed_beta'),
            false
        )
        OR COALESCE((auth.jwt() -> 'app_metadata' ->> 'beta_member')::boolean, false)
        OR public.is_current_user_admin();
$$;

REVOKE ALL ON FUNCTION public.has_beta_write_access() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_beta_write_access() TO anon, authenticated, service_role;

-- ----------------------------------------------------------------
-- 3. ユーザーコンテンツ書き込みポリシーへβ検査を追加
--    （039_account_moderation.sql の各ポリシーの条件 + β検査）
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "posts_insert_active_users" ON public.posts;
CREATE POLICY "posts_insert_active_users"
    ON public.posts FOR INSERT
    WITH CHECK (
        auth.uid() = user_id
        AND public.is_profile_active_for_writes(user_id)
        AND public.has_beta_write_access()
    );

DROP POLICY IF EXISTS "likes_insert_active_users" ON public.likes;
CREATE POLICY "likes_insert_active_users"
    ON public.likes FOR INSERT
    WITH CHECK (
        auth.uid() = user_id
        AND public.is_profile_active_for_writes(user_id)
        AND public.has_beta_write_access()
        AND EXISTS (
            SELECT 1
            FROM public.posts p
            WHERE p.id = post_id
              AND public.can_view_profile_content(p.user_id)
        )
    );

DROP POLICY IF EXISTS "reposts_insert_active_users" ON public.reposts;
CREATE POLICY "reposts_insert_active_users"
    ON public.reposts FOR INSERT
    WITH CHECK (
        auth.uid() = user_id
        AND public.is_profile_active_for_writes(user_id)
        AND public.has_beta_write_access()
        AND EXISTS (
            SELECT 1
            FROM public.posts p
            WHERE p.id = post_id
              AND public.can_view_profile_content(p.user_id)
        )
    );

DROP POLICY IF EXISTS "follows_insert_active_users" ON public.follows;
CREATE POLICY "follows_insert_active_users"
    ON public.follows FOR INSERT
    WITH CHECK (
        (
            auth.uid() = follower_id
            OR (
                auth.uid() = following_id
                AND EXISTS (
                    SELECT 1
                    FROM public.follow_requests fr
                    WHERE fr.requester_id = follower_id
                      AND fr.target_id = following_id
                      AND fr.status = 'pending'
                )
            )
        )
        AND public.is_profile_active_for_writes(follower_id)
        AND public.has_beta_write_access()
    );

DROP POLICY IF EXISTS "follow_requests_insert_active_users" ON public.follow_requests;
CREATE POLICY "follow_requests_insert_active_users" ON public.follow_requests
    FOR INSERT WITH CHECK (
        auth.uid() = requester_id
        AND public.is_profile_active_for_writes(requester_id)
        AND public.has_beta_write_access()
        AND EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE p.id = target_id
              AND p.is_private = true
        )
        AND NOT EXISTS (
            SELECT 1
            FROM public.follows f
            WHERE f.follower_id = requester_id
              AND f.following_id = target_id
        )
    );

DROP POLICY IF EXISTS "bookmarks_insert_active_users" ON public.bookmarks;
CREATE POLICY "bookmarks_insert_active_users" ON public.bookmarks
    FOR INSERT WITH CHECK (
        auth.uid() = user_id
        AND public.is_profile_active_for_writes(user_id)
        AND public.has_beta_write_access()
    );

DROP POLICY IF EXISTS "hashtags: 認証済みユーザーが追加可" ON public.hashtags;
CREATE POLICY "hashtags: 認証済みユーザーが追加可"
    ON public.hashtags FOR INSERT
    WITH CHECK (
        auth.role() = 'authenticated'
        AND public.has_beta_write_access()
        AND char_length(name) BETWEEN 1 AND 100
    );

-- post_hashtags は 120_hashtag_integrity.sql で所有権検査と合わせて再作成する。

DROP POLICY IF EXISTS "user_anime_list: 自分のみ編集可能" ON public.user_anime_list;
CREATE POLICY "user_anime_list: 自分のみ編集可能"
    ON public.user_anime_list FOR INSERT
    WITH CHECK (auth.uid() = user_id AND public.has_beta_write_access());

DROP POLICY IF EXISTS "user_anime_list: 自分のみ更新可能" ON public.user_anime_list;
CREATE POLICY "user_anime_list: 自分のみ更新可能"
    ON public.user_anime_list FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id AND public.has_beta_write_access());

DROP POLICY IF EXISTS "muted_words: users can insert own rows" ON public.muted_words;
CREATE POLICY "muted_words: users can insert own rows"
    ON public.muted_words FOR INSERT
    WITH CHECK (auth.uid() = user_id AND public.has_beta_write_access());

DROP POLICY IF EXISTS "anime_recommendations: users can insert own recommendations"
    ON public.anime_recommendations;
CREATE POLICY "anime_recommendations: users can insert own recommendations"
    ON public.anime_recommendations FOR INSERT
    WITH CHECK (auth.uid() = recommender_id AND public.has_beta_write_access());

DROP POLICY IF EXISTS "reports_insert_own" ON public.reports;
CREATE POLICY "reports_insert_own" ON public.reports
    FOR INSERT WITH CHECK (auth.uid() = reporter_id AND public.has_beta_write_access());

-- ----------------------------------------------------------------
-- 4. Storage の書き込みポリシーにもβ検査を追加
--    （直接 Storage API による無制限アップロードの一次遮断。
--      クォータ・件数制限は別途サーバー側で管理する）
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "authenticated users can upload post images" ON storage.objects;
CREATE POLICY "authenticated users can upload post images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'post-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
    AND public.has_beta_write_access()
);

DROP POLICY IF EXISTS "authenticated users can upload their own avatar" ON storage.objects;
CREATE POLICY "authenticated users can upload their own avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'profile-avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
    AND public.has_beta_write_access()
);

DROP POLICY IF EXISTS "users can update their own avatar" ON storage.objects;
CREATE POLICY "users can update their own avatar"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = 'profile-avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
    AND public.has_beta_write_access()
);

DROP POLICY IF EXISTS "users can upload their own profile header" ON storage.objects;
CREATE POLICY "users can upload their own profile header"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'profile-headers'
    AND auth.uid()::text = (storage.foldername(name))[1]
    AND public.has_beta_write_access()
);

DROP POLICY IF EXISTS "users can update their own profile header" ON storage.objects;
CREATE POLICY "users can update their own profile header"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = 'profile-headers'
    AND auth.uid()::text = (storage.foldername(name))[1]
    AND public.has_beta_write_access()
);

-- 注意: profiles の INSERT/UPDATE は意図的に対象外。
-- 招待コード償還〜オンボーディング完了（プロフィール作成）の間は JWT に
-- beta_member が反映されていない可能性があり、ここでβ検査を要求すると
-- 正規の新規ユーザーのオンボーディングが壊れるため。
