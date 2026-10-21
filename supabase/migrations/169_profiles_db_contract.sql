-- ============================================================
-- 169_profiles_db_contract: プロフィールの入力の決まりを DB で守る（#236）
-- ============================================================
-- profiles の UPDATE ポリシーは「自分の行」しか見ず、authenticated は全列を更新できた。画面側の検査
-- （ユーザー名の形・表示名と自己紹介の文字数）は、Supabase の REST API を直接呼ぶと素通りできた。
--
--   1. CHECK 制約: 画面と同じ決まりを DB にも置く
--        username      ^[a-z0-9_]{3,20}$（小文字は 162 で強制済み）
--        display_name  50 文字以内
--        bio           160 文字以内
--      本番の既存データに違反は無い（2026-10-21 確認: 65 件、表示名は最長 21 文字・自己紹介は最長 5 文字）
--   2. handle_new_user: メールの登録で送られた表示名（full_name / name）は利用者が自由に送れるので、
--      50 文字に切ってから入れる（切らないと CHECK に引っかかって登録ごと失敗する）。それ以外は 161 の版のまま
--
-- 更新できる列を絞る（username を直接変えられなくする）変更は、アプリの username の書き換えを
-- service role に移した版が本番に出てから適用する別の migration に分けた（今の本番のアプリは、
-- 利用者の権限で username を更新しているため）。

ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_username_format CHECK (username ~ '^[a-z0-9_]{3,20}$'),
    ADD CONSTRAINT profiles_display_name_length CHECK (display_name IS NULL OR char_length(display_name) <= 50),
    ADD CONSTRAINT profiles_bio_length CHECK (bio IS NULL OR char_length(bio) <= 160);

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
