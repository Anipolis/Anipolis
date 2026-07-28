-- Add CC0 Wikidata records as a public, source-specific title supplement.

ALTER TABLE public.anime_source_records
    DROP CONSTRAINT IF EXISTS anime_source_records_source_check;

ALTER TABLE public.anime_source_records
    ADD CONSTRAINT anime_source_records_source_check
    CHECK (source IN ('anime_offline_database', 'jikan', 'wikidata'));

DROP POLICY IF EXISTS "anime source records: public can read ODbL" ON public.anime_source_records;
DROP POLICY IF EXISTS "anime source records: public can read open sources" ON public.anime_source_records;
CREATE POLICY "anime source records: public can read open sources"
    ON public.anime_source_records FOR SELECT
    TO anon, authenticated
    USING (source IN ('anime_offline_database', 'wikidata'));

COMMENT ON TABLE public.anime_source_records IS
    'Normalized source snapshots. ODbL and CC0 Wikidata rows are public; Jikan rows remain internal.';
