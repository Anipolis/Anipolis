-- Allow Annict (api.annict.com GraphQL) snapshots as an internal enrichment
-- source. Annict is community-edited, so the resolver ranks it below every
-- other source and only uses it to fill official site / X URLs that are still
-- empty. Like Jikan and MAL rows, 'annict' rows stay internal: the public read
-- policy is intentionally left unchanged.

ALTER TABLE public.anime_source_records
    DROP CONSTRAINT IF EXISTS anime_source_records_source_check;

ALTER TABLE public.anime_source_records
    ADD CONSTRAINT anime_source_records_source_check
    CHECK (source IN ('anime_offline_database', 'jikan', 'wikidata', 'syobocal', 'manual', 'mal', 'annict'));

COMMENT ON TABLE public.anime_source_records IS
    'Normalized source snapshots. ODbL and CC0 Wikidata rows are public; Jikan, MAL official API and Annict rows remain internal.';

-- Credit Annict on the public attribution projection like the other sources.
ALTER TABLE public.anime_data_attributions
    DROP CONSTRAINT IF EXISTS anime_data_attributions_source_check;

ALTER TABLE public.anime_data_attributions
    ADD CONSTRAINT anime_data_attributions_source_check
    CHECK (source IN ('anime_offline_database', 'jikan', 'wikidata', 'syobocal', 'mal', 'annict'));
