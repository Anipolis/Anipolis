-- Use anonymous defaults for external OAuth (Google + Discord) profiles instead of provider account names.
-- Generalizes 063: Discord now follows the same random-username path as Google.
-- avatar_url is still imported from provider metadata. Existing users are NOT backfilled.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    base_username     text;
    final_username    text;
    counter           integer := 0;
    suffix            text;
    chars             text := 'abcdefghijklmnopqrstuvwxyz0123456789';
    is_external_oauth boolean := false;
BEGIN
    is_external_oauth :=
        new.raw_app_meta_data->>'provider' IN ('google', 'discord')
        OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(
                CASE
                    WHEN jsonb_typeof(new.raw_app_meta_data->'providers') = 'array'
                    THEN new.raw_app_meta_data->'providers'
                    ELSE '[]'::jsonb
                END
            ) AS provider
            WHERE provider IN ('google', 'discord')
        );

    IF is_external_oauth THEN
        LOOP
            suffix := '';

            FOR counter IN 1..7 LOOP
                suffix := suffix || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
            END LOOP;

            final_username := 'user' || suffix;
            EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE username = final_username);
        END LOOP;

        INSERT INTO public.profiles (id, username, display_name, avatar_url)
        VALUES (
            new.id,
            final_username,
            final_username,
            new.raw_user_meta_data->>'avatar_url'
        );

        RETURN new;
    END IF;

    base_username := COALESCE(
        new.raw_user_meta_data->>'user_name',
        split_part(new.email, '@', 1)
    );
    base_username := regexp_replace(base_username, '[^a-zA-Z0-9_]', '', 'g');

    IF char_length(base_username) < 3 THEN
        base_username := 'user' || base_username;
    END IF;

    base_username := left(base_username, 20);
    final_username := base_username;

    WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = final_username) LOOP
        counter := counter + 1;
        final_username := left(base_username, 17) || counter::text;
    END LOOP;

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
