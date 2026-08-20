-- Store Syoboi Calendar snapshots internally and map their TIDs to MAL anime identities.

ALTER TABLE public.anime_source_records
    DROP CONSTRAINT IF EXISTS anime_source_records_source_check;
ALTER TABLE public.anime_source_records
    ADD CONSTRAINT anime_source_records_source_check
    CHECK (source IN ('anime_offline_database', 'jikan', 'wikidata', 'syobocal', 'manual'));

CREATE TABLE IF NOT EXISTS public.syobocal_titles (
    tid bigint PRIMARY KEY CHECK (tid > 0),
    source_url text NOT NULL,
    title text NOT NULL,
    short_title text,
    title_yomi text,
    category integer,
    first_year integer,
    first_month integer,
    first_channel text,
    official_site_url text,
    official_x_url text,
    links jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(links) = 'array'),
    raw_data jsonb NOT NULL CHECK (jsonb_typeof(raw_data) = 'object'),
    source_updated_at timestamptz,
    imported_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.syobocal_channels (
    chid bigint PRIMARY KEY CHECK (chid > 0),
    name text NOT NULL,
    epg_name text,
    channel_group_id bigint,
    channel_number integer,
    site_url text,
    epg_url text,
    raw_data jsonb NOT NULL CHECK (jsonb_typeof(raw_data) = 'object'),
    source_updated_at timestamptz,
    imported_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.syobocal_programs (
    pid bigint PRIMARY KEY CHECK (pid > 0),
    tid bigint NOT NULL REFERENCES public.syobocal_titles(tid) ON DELETE RESTRICT,
    chid bigint NOT NULL REFERENCES public.syobocal_channels(chid) ON DELETE RESTRICT,
    starts_at timestamptz NOT NULL,
    ends_at timestamptz NOT NULL,
    start_offset_seconds integer NOT NULL DEFAULT 0,
    episode_number integer,
    subtitle text,
    program_comment text,
    flags integer NOT NULL DEFAULT 0,
    deleted boolean NOT NULL DEFAULT false,
    warning boolean NOT NULL DEFAULT false,
    revision integer NOT NULL DEFAULT 0,
    raw_data jsonb NOT NULL CHECK (jsonb_typeof(raw_data) = 'object'),
    source_updated_at timestamptz,
    imported_at timestamptz NOT NULL DEFAULT now(),
    CHECK (ends_at >= starts_at)
);

CREATE INDEX IF NOT EXISTS syobocal_programs_tid_starts_at_idx
    ON public.syobocal_programs (tid, starts_at);
CREATE INDEX IF NOT EXISTS syobocal_programs_chid_starts_at_idx
    ON public.syobocal_programs (chid, starts_at);

CREATE TABLE IF NOT EXISTS public.anime_external_mappings (
    external_source text NOT NULL CHECK (external_source IN ('syobocal')),
    external_key text NOT NULL CHECK (external_key ~ '^[1-9][0-9]*$'),
    mal_id bigint NOT NULL CHECK (mal_id > 0),
    match_status text NOT NULL CHECK (match_status IN ('candidate', 'confirmed', 'rejected')),
    match_method text NOT NULL
        CHECK (match_method IN ('manual', 'wikidata_property', 'normalized_title_exact')),
    is_primary boolean NOT NULL DEFAULT false,
    use_for_title boolean NOT NULL DEFAULT false,
    valid_from date,
    valid_to date,
    evidence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence) = 'object'),
    source_url text NOT NULL,
    source_version text,
    imported_at timestamptz NOT NULL DEFAULT now(),
    reviewed_at timestamptz,
    PRIMARY KEY (external_source, external_key, mal_id),
    CHECK (NOT is_primary OR match_status = 'confirmed'),
    CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from)
);

CREATE INDEX IF NOT EXISTS anime_external_mappings_external_key_idx
    ON public.anime_external_mappings (external_source, external_key);
CREATE UNIQUE INDEX IF NOT EXISTS anime_external_mappings_primary_mal_id_idx
    ON public.anime_external_mappings (external_source, mal_id)
    WHERE is_primary;

ALTER TABLE public.syobocal_titles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.syobocal_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.syobocal_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anime_external_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "syobocal titles: admins can read"
    ON public.syobocal_titles FOR SELECT TO authenticated
    USING (public.is_current_user_admin());
CREATE POLICY "syobocal channels: admins can read"
    ON public.syobocal_channels FOR SELECT TO authenticated
    USING (public.is_current_user_admin());
CREATE POLICY "syobocal programs: admins can read"
    ON public.syobocal_programs FOR SELECT TO authenticated
    USING (public.is_current_user_admin());
CREATE POLICY "anime external mappings: admins can read"
    ON public.anime_external_mappings FOR SELECT TO authenticated
    USING (public.is_current_user_admin());

GRANT SELECT ON public.syobocal_titles, public.syobocal_channels, public.syobocal_programs,
    public.anime_external_mappings TO authenticated;
GRANT ALL ON public.syobocal_titles, public.syobocal_channels, public.syobocal_programs,
    public.anime_external_mappings TO service_role;

COMMENT ON TABLE public.syobocal_titles IS
    'Internal Syoboi Calendar title snapshots keyed by TID; excluded from the public ODbL export.';
COMMENT ON TABLE public.syobocal_programs IS
    'Internal per-channel Syoboi Calendar program slots keyed by PID; absolute timestamps are authoritative.';
COMMENT ON TABLE public.anime_external_mappings IS
    'Auditable candidate and confirmed mappings between MAL anime IDs and external source identifiers.';
COMMENT ON COLUMN public.anime_external_mappings.use_for_title IS
    'Whether the mapped Syoboi title is entry-specific enough to verify and publish as the anime display title.';
