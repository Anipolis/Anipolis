-- First-login onboarding privacy fix.
-- OAuth providers: do not create a public profile before the user confirms the
--   username, display name, and avatar on the Anipolis onboarding screen.
-- Email/password: registrant chose the username explicitly in the registration form,
--   so the profile can be created immediately.

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
    base_username := regexp_replace(base_username, '[^a-zA-Z0-9_]', '', 'g');

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
