-- Record conservative Syobocal -> Japanese Wikipedia -> Wikidata -> MAL identity matches.

ALTER TABLE public.anime_external_mappings
    DROP CONSTRAINT IF EXISTS anime_external_mappings_match_method_check;

ALTER TABLE public.anime_external_mappings
    ADD CONSTRAINT anime_external_mappings_match_method_check
    CHECK (
        match_method IN (
            'manual',
            'wikidata_property',
            'wikipedia_wikidata',
            'normalized_title_exact'
        )
    );

COMMENT ON COLUMN public.anime_external_mappings.match_method IS
    'Identity evidence: manual, direct Wikidata properties, Syobocal Wikipedia keyword resolved through Wikidata, or conservative exact title matching.';
