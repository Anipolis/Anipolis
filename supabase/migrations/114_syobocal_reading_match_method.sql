-- Allow the reading/Latin second-tier Syobocal matcher (kana reading or
-- mostly-Latin title fold, premiere within three months, unique both ways).

ALTER TABLE public.anime_external_mappings
    DROP CONSTRAINT IF EXISTS anime_external_mappings_match_method_check;

ALTER TABLE public.anime_external_mappings
    ADD CONSTRAINT anime_external_mappings_match_method_check
    CHECK (
        match_method IN (
            'manual',
            'wikidata_property',
            'wikipedia_wikidata',
            'normalized_title_exact',
            'reading_title_exact'
        )
    );

COMMENT ON COLUMN public.anime_external_mappings.match_method IS
    'Identity evidence: manual, direct Wikidata properties, Syobocal Wikipedia keyword resolved through Wikidata, conservative exact title matching, or kana-reading/Latin-fold matching with premiere-date agreement.';
