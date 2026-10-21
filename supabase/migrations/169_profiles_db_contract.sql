-- ============================================================
-- 169_profiles_db_contract: プロフィールの入力の決まりと更新できる列を DB で守る（#236）
-- ============================================================
-- profiles の UPDATE ポリシーは「自分の行」しか見ず、authenticated は全列を更新できた。画面側の検査
-- （ユーザー名の形・表示名と自己紹介の文字数・ユーザー名変更時の現在のパスワード）は、Supabase の
-- REST API を直接呼ぶと素通りできた。
--
--   1. CHECK 制約: 画面と同じ決まりを DB にも置く
--        username      ^[a-z0-9_]{3,20}$（小文字は 162 で強制済み）
--        display_name  50 文字以内
--        bio           160 文字以内
--      本番の既存データに違反は無い（2026-10-21 確認: 65 件、表示名は最長 21 文字・自己紹介は最長 5 文字）
--   2. 列の UPDATE 権限: authenticated が直接更新できるのは、アプリが本人の操作で書き換える列だけにする
--        display_name, bio, avatar_url, header_url, list_is_public, is_private
--      username は、現在のパスワードを確かめた後にサーバーが service role で書き換える
--      （src/routes/settings/account/+page.server.ts）。is_admin・setup_completed・created_at なども直接は変えられない。
--      新規作成（INSERT）の権限は今どおり（初期設定で username を決めて作るため。CHECK と 161 のトリガーが守る）
--   3. handle_new_user: メールの登録で送られた表示名（full_name / name）は利用者が自由に送れるので、
--      50 文字に切ってから入れる（切らないと CHECK に引っかかって登録ごと失敗する）。それ以外は 161 の版のまま

ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_username_format CHECK (username ~ '^[a-z0-9_]{3,20}$'),
    ADD CONSTRAINT profiles_display_name_length CHECK (display_name IS NULL OR char_length(display_name) <= 50),
    ADD CONSTRAINT profiles_bio_length CHECK (bio IS NULL OR char_length(bio) <= 160);

REVOKE UPDATE ON public.profiles FROM anon, authenticated;
GRANT UPDATE (display_name, bio, avatar_url, header_url, list_is_public, is_private) ON public.profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    base_username  text;
    final_username text;
BEGIN
    -- Email/password only. Any non-email provider should wait for onboarding.
    IF COALESCE(new.raw_app_meta_data->>'provider', 'email') <> 'email'
       OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(
                CASE
                    WHEN jsonb_typeof(new.raw_app_meta_data->'providers') = 'array'
                    THEN new.raw_app_meta_data->'providers'
                    ELSE '[]'::jsonb
                END
            ) AS provider
            WHERE provider <> 'email'
       ) THEN
        RETURN new;
    END IF;

    -- Email/password: derive username from the value entered in the Anipolis form.
    base_username := COALESCE(
        new.raw_user_meta_data->>'user_name',
        split_part(new.email, '@', 1),
        'user'
    );
    -- ID は小文字にそろえる（大文字・小文字の違いだけの ID を作らない）
    base_username := lower(regexp_replace(base_username, '[^a-zA-Z0-9_]', '', 'g'));

    IF char_length(base_username) < 3 THEN
        base_username := 'user' || base_username;
    END IF;

    base_username := left(base_username, 20);
    final_username := base_username;

    INSERT INTO public.profiles (id, username, display_name, avatar_url)
    VALUES (
        new.id,
        final_username,
        -- 表示名は 50 文字まで（profiles_display_name_length）
        left(COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', final_username), 50),
        new.raw_user_meta_data->>'avatar_url'
    );

    RETURN new;
END;
$$;
