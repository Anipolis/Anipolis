-- 放送局(broadcast_station)と放送枠尺(broadcast_duration_minutes)をカタログ
-- 解決の対象に加えるため、管理画面編集のmanualソースレコード自動キャプチャにも
-- 両フィールドを含める。これが無いと、管理者が入力した放送局・尺が次回の
-- カタログ再解決でしょぼい主局由来の値に上書きされてしまう。

CREATE OR REPLACE FUNCTION public.capture_anime_manual_source()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_data jsonb;
    previous_data jsonb;
    manual_data jsonb;
    field_name text;
    has_changes boolean := false;
BEGIN
    IF NEW.mal_id IS NULL OR auth.uid() IS NULL OR NOT public.is_current_user_admin() THEN
        RETURN NEW;
    END IF;

    current_data := jsonb_build_object(
        'mal_id', NEW.mal_id,
        'title', NEW.title,
        'title_en', NEW.title_en,
        'title_romaji', NEW.title_romaji,
        'episode_count', NEW.episode_count,
        'type', NEW.type,
        'status', NEW.status,
        'aired_from', NEW.aired_from,
        'aired_to', NEW.aired_to,
        'season', NEW.season,
        'source', NEW.source,
        'studio', NEW.studio,
        'studio_en', NEW.studio_en,
        'genre', NEW.genre,
        'genre_en', NEW.genre_en,
        'broadcast_day', NEW.broadcast_day,
        'broadcast_time', NEW.broadcast_time,
        'broadcast_station', NEW.broadcast_station,
        'broadcast_duration_minutes', NEW.broadcast_duration_minutes,
        'official_site_url', NEW.official_site_url,
        'official_x_url', NEW.official_x_url,
        'resources', NEW.resources,
        'cover_url', NEW.cover_url
    );

    IF TG_OP = 'INSERT' THEN
        manual_data := current_data;
        has_changes := true;
    ELSE
        previous_data := jsonb_build_object(
            'mal_id', OLD.mal_id,
            'title', OLD.title,
            'title_en', OLD.title_en,
            'title_romaji', OLD.title_romaji,
            'episode_count', OLD.episode_count,
            'type', OLD.type,
            'status', OLD.status,
            'aired_from', OLD.aired_from,
            'aired_to', OLD.aired_to,
            'season', OLD.season,
            'source', OLD.source,
            'studio', OLD.studio,
            'studio_en', OLD.studio_en,
            'genre', OLD.genre,
            'genre_en', OLD.genre_en,
            'broadcast_day', OLD.broadcast_day,
            'broadcast_time', OLD.broadcast_time,
            'broadcast_station', OLD.broadcast_station,
            'broadcast_duration_minutes', OLD.broadcast_duration_minutes,
            'official_site_url', OLD.official_site_url,
            'official_x_url', OLD.official_x_url,
            'resources', OLD.resources,
            'cover_url', OLD.cover_url
        );
        SELECT normalized_data
        INTO manual_data
        FROM public.anime_source_records
        WHERE mal_id = NEW.mal_id AND source = 'manual';
        manual_data := coalesce(manual_data, jsonb_build_object('mal_id', NEW.mal_id));

        FOR field_name IN SELECT jsonb_object_keys(current_data)
        LOOP
            IF field_name <> 'mal_id'
                AND (current_data -> field_name) IS DISTINCT FROM (previous_data -> field_name)
            THEN
                manual_data := manual_data || jsonb_build_object(field_name, current_data -> field_name);
                has_changes := true;
            END IF;
        END LOOP;
    END IF;

    IF NOT has_changes THEN
        RETURN NEW;
    END IF;

    INSERT INTO public.anime_source_records (
        mal_id,
        source,
        source_version,
        source_url,
        source_updated_at,
        normalized_data,
        imported_at
    ) VALUES (
        NEW.mal_id,
        'manual',
        'admin-v1',
        'internal://anime-admin',
        CURRENT_DATE,
        manual_data,
        now()
    )
    ON CONFLICT (mal_id, source) DO UPDATE SET
        source_version = EXCLUDED.source_version,
        source_url = EXCLUDED.source_url,
        source_updated_at = EXCLUDED.source_updated_at,
        normalized_data = EXCLUDED.normalized_data,
        imported_at = EXCLUDED.imported_at;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS anime_capture_manual_source ON public.anime;
CREATE TRIGGER anime_capture_manual_source
AFTER INSERT OR UPDATE OF
    title,
    title_en,
    title_romaji,
    episode_count,
    type,
    status,
    aired_from,
    aired_to,
    season,
    source,
    studio,
    studio_en,
    genre,
    genre_en,
    broadcast_day,
    broadcast_time,
    broadcast_station,
    broadcast_duration_minutes,
    official_site_url,
    official_x_url,
    resources,
    cover_url
ON public.anime
FOR EACH ROW
EXECUTE FUNCTION public.capture_anime_manual_source();
