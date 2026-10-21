-- ============================================================
-- 161_profile_username_case_insensitive: ID を大文字・小文字を区別しないものにする
-- ============================================================
-- X でログインした利用者のプロフィールが、初期設定（オンボーディング）を通らずに、X の ID を
-- 大文字のまま使って作られていた（2026-10-15）。本番の handle_new_user が 063 の版のままで、
-- 083（OAuth の利用者は初期設定でプロフィールを作る）が実際には効いていなかった（migration の
-- 記録は適用済みになっている。以前の repair で印だけ付いたとみられる）。
--   * handle_new_user を 083 の版に戻す。メールの登録の ID は小文字にそろえる
--   * 大文字を含む既存の ID を小文字にする（アプリの初期設定・登録はもともと小文字で保存する）
--   * 大文字・小文字を区別しない一意のインデックスを足す（is_username_available は lower で比べて
--     いたが、最後の重複の判定 profiles.username UNIQUE は区別していた）

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
        COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', final_username),
        new.raw_user_meta_data->>'avatar_url'
    );

    RETURN new;
END;
$$;

-- 既存の ID を小文字に（2026-10-15 時点で大文字を含むのは1件、小文字にしてぶつかるものは無い）
UPDATE public.profiles SET username = lower(username) WHERE username <> lower(username);

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_key ON public.profiles (lower(username));
