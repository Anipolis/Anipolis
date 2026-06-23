-- First-login onboarding + Discord identity defaults.
-- Google: anonymized random handle (063 踏襲).
-- Discord: use the (globally unique) Discord username and nickname directly; only on a
--   username collision append a short 4-char random suffix. Discord users still pass through
--   onboarding (setup_completed=false) so they can confirm/edit their auto-filled name.
-- Email/password: registrant chose the username explicitly -> setup_completed=true.
-- Existing accounts are backfilled as completed.

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS setup_completed boolean NOT NULL DEFAULT false;

-- Existing accounts already have chosen names; don't force them through onboarding.
UPDATE public.profiles
SET setup_completed = true
WHERE setup_completed = false;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    base_username  text;
    final_username text;
    suffix         text;
    i              integer;
    chars          text := 'abcdefghijklmnopqrstuvwxyz0123456789';
    is_google      boolean := false;
    is_discord     boolean := false;
BEGIN
    is_google :=
        new.raw_app_meta_data->>'provider' = 'google'
        OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(
                CASE
                    WHEN jsonb_typeof(new.raw_app_meta_data->'providers') = 'array'
                    THEN new.raw_app_meta_data->'providers'
                    ELSE '[]'::jsonb
                END
            ) AS provider
            WHERE provider = 'google'
        );

    is_discord :=
        new.raw_app_meta_data->>'provider' = 'discord'
        OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(
                CASE
                    WHEN jsonb_typeof(new.raw_app_meta_data->'providers') = 'array'
                    THEN new.raw_app_meta_data->'providers'
                    ELSE '[]'::jsonb
                END
            ) AS provider
            WHERE provider = 'discord'
        );

    -- Google: anonymized random handle.
    IF is_google THEN
        LOOP
            suffix := '';
            FOR i IN 1..7 LOOP
                suffix := suffix || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
            END LOOP;

            final_username := 'user' || suffix;
            EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE username = final_username);
        END LOOP;

        INSERT INTO public.profiles (id, username, display_name, avatar_url, setup_completed)
        VALUES (
            new.id,
            final_username,
            final_username,
            new.raw_user_meta_data->>'avatar_url',
            false
        );

        RETURN new;
    END IF;

    -- Discord / email: derive username from the Discord username (unique) or email local part.
    base_username := COALESCE(
        new.raw_user_meta_data->>'user_name',
        split_part(new.email, '@', 1)
    );
    base_username := regexp_replace(base_username, '[^a-zA-Z0-9_]', '', 'g');

    IF char_length(base_username) < 3 THEN
        base_username := 'user' || base_username;
    END IF;

    base_username := left(base_username, 20);

    -- Discord usernames are globally unique; only append a short random suffix on collision.
    final_username := base_username;
    WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = final_username) LOOP
        suffix := '';
        FOR i IN 1..4 LOOP
            suffix := suffix || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
        END LOOP;

        final_username := left(base_username, 16) || suffix;
    END LOOP;

    INSERT INTO public.profiles (id, username, display_name, avatar_url, setup_completed)
    VALUES (
        new.id,
        final_username,
        -- Discord のニックネーム(global_name)は full_name に入る
        COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', final_username),
        new.raw_user_meta_data->>'avatar_url',
        -- Discord は onboarding で確認・編集、メール登録は確定済み
        NOT is_discord
    );

    RETURN new;
END;
$$;
