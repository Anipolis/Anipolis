-- Keep source labels intact while selecting one canonical display name per studio identity.

ALTER TABLE public.studio_source_records
    ADD COLUMN IF NOT EXISTS canonical_name_ja text,
    ADD COLUMN IF NOT EXISTS canonical_name_en text,
    ADD COLUMN IF NOT EXISTS canonical_name_source text;

UPDATE public.studio_source_records
SET
    canonical_name_ja = COALESCE(canonical_name_ja, name_ja),
    canonical_name_en = COALESCE(canonical_name_en, name_en),
    canonical_name_source = COALESCE(canonical_name_source, 'wikidata');

ALTER TABLE public.studio_source_records
    ALTER COLUMN canonical_name_en SET NOT NULL,
    ALTER COLUMN canonical_name_source SET NOT NULL;

ALTER TABLE public.studio_source_records
    DROP CONSTRAINT IF EXISTS studio_source_records_canonical_name_source_check;
ALTER TABLE public.studio_source_records
    ADD CONSTRAINT studio_source_records_canonical_name_source_check
    CHECK (canonical_name_source IN ('jikan', 'wikidata'));

COMMENT ON COLUMN public.studio_source_records.canonical_name_ja IS
    'Canonical Japanese/display name selected after identity resolution; Jikan naming is preferred when available.';
COMMENT ON COLUMN public.studio_source_records.canonical_name_en IS
    'Canonical English name selected after identity resolution; Jikan naming is preferred when available.';
COMMENT ON COLUMN public.studio_source_records.canonical_name_source IS
    'Source whose spelling was selected for canonical display. Raw Wikidata labels remain in name_ja/name_en.';
