-- Publish a minimal attribution projection without exposing internal source snapshots or matching evidence.

CREATE TABLE IF NOT EXISTS public.anime_data_attributions (
    anime_mal_id bigint NOT NULL REFERENCES public.anime(mal_id) ON DELETE CASCADE,
    source text NOT NULL
        CHECK (source IN ('anime_offline_database', 'jikan', 'wikidata', 'syobocal')),
    label text NOT NULL CHECK (length(btrim(label)) > 0),
    source_url text NOT NULL CHECK (source_url ~ '^https?://'),
    license_label text,
    license_url text CHECK (license_url IS NULL OR license_url ~ '^https?://'),
    PRIMARY KEY (anime_mal_id, source)
);

ALTER TABLE public.anime_data_attributions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anime data attributions: visible with anime" ON public.anime_data_attributions;
CREATE POLICY "anime data attributions: visible with anime"
    ON public.anime_data_attributions FOR SELECT
    TO anon, authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.anime
            WHERE anime.mal_id = anime_data_attributions.anime_mal_id
        )
    );

GRANT SELECT ON public.anime_data_attributions TO anon, authenticated;
GRANT ALL ON public.anime_data_attributions TO service_role;

COMMENT ON TABLE public.anime_data_attributions IS
    'Public, minimal per-title attribution links. Raw source data, field-level provenance, match evidence, and import metadata remain internal.';
