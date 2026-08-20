-- Resolve source-specific anime metadata deterministically before publishing it.

ALTER TABLE public.anime_source_records
    DROP CONSTRAINT IF EXISTS anime_source_records_source_check;

ALTER TABLE public.anime_source_records
    ALTER COLUMN mal_id TYPE bigint;

ALTER TABLE public.anime_source_records
    ADD CONSTRAINT anime_source_records_source_check
    CHECK (source IN ('anime_offline_database', 'jikan', 'wikidata', 'manual'));

ALTER TABLE public.anime
    ADD COLUMN IF NOT EXISTS metadata_ready boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS anime_metadata_ready_idx
    ON public.anime (metadata_ready);

DROP VIEW IF EXISTS public.anime_with_computed_broadcast_status;

CREATE VIEW public.anime_with_computed_broadcast_status
WITH (security_invoker = true) AS
SELECT
    anime.*,
    CASE
        WHEN aired_from IS NOT NULL AND aired_from > (now() AT TIME ZONE 'Asia/Tokyo')::date
            THEN 'upcoming'
        WHEN aired_to IS NOT NULL AND aired_to < (now() AT TIME ZONE 'Asia/Tokyo')::date
            THEN 'finished'
        WHEN aired_from IS NOT NULL
            AND aired_from <= (now() AT TIME ZONE 'Asia/Tokyo')::date
            AND aired_to IS NULL
            AND regexp_replace(lower(coalesce(type, '')), '[^a-z0-9]', '', 'g')
                IN ('movie', 'ona', 'ova', 'tvspecial', 'special')
            THEN 'finished'
        WHEN aired_from IS NOT NULL
            AND aired_from <= (now() AT TIME ZONE 'Asia/Tokyo')::date
            AND (aired_to IS NULL OR aired_to >= (now() AT TIME ZONE 'Asia/Tokyo')::date)
            THEN 'airing'
        ELSE 'unknown'
    END AS computed_broadcast_status
FROM public.anime;

GRANT SELECT ON public.anime_with_computed_broadcast_status TO anon, authenticated;

DROP POLICY IF EXISTS "anime: visible unless hidden by admin" ON public.anime;
CREATE POLICY "anime: published metadata visible unless hidden by admin"
    ON public.anime FOR SELECT
    USING (
        (metadata_ready AND NOT hidden_by_admin)
        OR public.is_current_user_admin()
    );

CREATE TABLE IF NOT EXISTS public.anime_resolution_records (
    mal_id bigint PRIMARY KEY REFERENCES public.anime(mal_id) ON DELETE CASCADE,
    resolved_data jsonb NOT NULL CHECK (jsonb_typeof(resolved_data) = 'object'),
    field_sources jsonb NOT NULL CHECK (jsonb_typeof(field_sources) = 'object'),
    publication_status text NOT NULL CHECK (publication_status IN ('draft', 'review', 'published')),
    publication_reasons jsonb NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(publication_reasons) = 'array'),
    resolved_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.anime_resolution_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anime resolution records: admins can read" ON public.anime_resolution_records;
CREATE POLICY "anime resolution records: admins can read"
    ON public.anime_resolution_records FOR SELECT
    TO authenticated
    USING (public.is_current_user_admin());

GRANT SELECT ON public.anime_resolution_records TO authenticated;
GRANT ALL ON public.anime_resolution_records TO service_role;

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
    official_site_url,
    official_x_url,
    resources,
    cover_url
ON public.anime
FOR EACH ROW
EXECUTE FUNCTION public.capture_anime_manual_source();

COMMENT ON COLUMN public.anime.metadata_ready IS
    'True only when the catalog resolver has enough verified metadata for public display.';
COMMENT ON TABLE public.anime_resolution_records IS
    'Latest deterministic catalog resolution result and field-level provenance for each MAL anime ID.';
COMMENT ON TABLE public.anime_source_records IS
    'Normalized source snapshots. ODbL and CC0 Wikidata rows are public; Jikan and manual rows remain internal.';
