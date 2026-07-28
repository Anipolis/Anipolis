-- Normalize studio identities while preserving the metadata-ready public visibility gate.

ALTER TABLE public.anime_resolution_records
    DROP CONSTRAINT IF EXISTS anime_resolution_records_publication_status_check;
ALTER TABLE public.anime_resolution_records
    RENAME COLUMN publication_status TO resolution_status;
ALTER TABLE public.anime_resolution_records
    RENAME COLUMN publication_reasons TO resolution_reasons;
UPDATE public.anime_resolution_records
SET resolution_status = CASE resolution_status
    WHEN 'published' THEN 'verified'
    WHEN 'draft' THEN 'unverified'
    ELSE resolution_status
END;
ALTER TABLE public.anime_resolution_records
    ADD CONSTRAINT anime_resolution_records_resolution_status_check
    CHECK (resolution_status IN ('unverified', 'review', 'verified'));

COMMENT ON COLUMN public.anime_resolution_records.resolution_status IS
    'Editorial verification state. Only verified rows set metadata_ready and appear in the public catalog.';

CREATE OR REPLACE VIEW public.anime_popularity
WITH (security_invoker = true) AS
SELECT
    a.id AS anime_id,
    COUNT(ual.anime_id) AS list_count
FROM public.anime a
LEFT JOIN public.user_anime_list ual ON ual.anime_id = a.id
WHERE a.metadata_ready
    AND (NOT a.hidden_by_admin OR public.is_current_user_admin())
GROUP BY a.id;

CREATE OR REPLACE VIEW public.anime_trending
WITH (security_invoker = true) AS
SELECT
    a.id AS anime_id,
    COUNT(ual.anime_id) AS recent_count
FROM public.anime a
LEFT JOIN public.user_anime_list ual
    ON ual.anime_id = a.id
    AND ual.updated_at >= now() - interval '7 days'
WHERE a.metadata_ready
    AND (NOT a.hidden_by_admin OR public.is_current_user_admin())
GROUP BY a.id;

CREATE OR REPLACE VIEW public.anime_top_rated
WITH (security_invoker = true) AS
SELECT
    a.id AS anime_id,
    COALESCE(AVG(ual.score) FILTER (WHERE ual.score IS NOT NULL), 0) AS avg_score,
    COUNT(ual.score) FILTER (WHERE ual.score IS NOT NULL) AS score_count
FROM public.anime a
LEFT JOIN public.user_anime_list ual ON ual.anime_id = a.id
WHERE a.metadata_ready
    AND (NOT a.hidden_by_admin OR public.is_current_user_admin())
GROUP BY a.id;

GRANT SELECT ON public.anime_popularity, public.anime_trending, public.anime_top_rated TO anon, authenticated;

CREATE TABLE IF NOT EXISTS public.studio_source_records (
    source text NOT NULL CHECK (source IN ('wikidata')),
    source_key text NOT NULL,
    source_url text NOT NULL,
    source_version text NOT NULL,
    name_ja text,
    name_en text NOT NULL,
    aliases jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(aliases) = 'array'),
    mal_company_id bigint,
    imported_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (source, source_key)
);

CREATE TABLE IF NOT EXISTS public.studio_name_aliases (
    alias_key text PRIMARY KEY,
    alias text NOT NULL,
    source text NOT NULL,
    source_key text NOT NULL,
    match_method text NOT NULL CHECK (match_method IN ('normalized_exact')),
    imported_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (source, source_key)
        REFERENCES public.studio_source_records(source, source_key)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS studio_name_aliases_source_idx
    ON public.studio_name_aliases (source, source_key);

ALTER TABLE public.studio_source_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.studio_name_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "studio source records: public can read open sources"
    ON public.studio_source_records FOR SELECT
    TO anon, authenticated
    USING (source = 'wikidata');

CREATE POLICY "studio name aliases: public can read open sources"
    ON public.studio_name_aliases FOR SELECT
    TO anon, authenticated
    USING (source = 'wikidata');

GRANT SELECT ON public.studio_source_records, public.studio_name_aliases TO anon, authenticated;
GRANT ALL ON public.studio_source_records, public.studio_name_aliases TO service_role;

COMMENT ON TABLE public.studio_source_records IS
    'Source-specific studio identities and localized names. Wikidata records are CC0.';
COMMENT ON TABLE public.studio_name_aliases IS
    'Unambiguous normalized aliases that connect imported studio strings to stable studio identities.';
