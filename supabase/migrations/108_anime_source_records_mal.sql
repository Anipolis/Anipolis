-- Allow MyAnimeList official API (api.myanimelist.net v2) snapshots as an
-- internal enrichment source. Like Jikan rows, 'mal' rows stay internal:
-- the public read policy is intentionally left unchanged.

ALTER TABLE public.anime_source_records
    DROP CONSTRAINT IF EXISTS anime_source_records_source_check;

ALTER TABLE public.anime_source_records
    ADD CONSTRAINT anime_source_records_source_check
    CHECK (source IN ('anime_offline_database', 'jikan', 'wikidata', 'syobocal', 'manual', 'mal'));

COMMENT ON TABLE public.anime_source_records IS
    'Normalized source snapshots. ODbL and CC0 Wikidata rows are public; Jikan and MAL official API rows remain internal.';
