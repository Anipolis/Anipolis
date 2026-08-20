-- Companion to 108: allow 'mal' in the attribution source list so the
-- resolver can publish MyAnimeList attributions for official-API data.

ALTER TABLE public.anime_data_attributions
    DROP CONSTRAINT IF EXISTS anime_data_attributions_source_check;

ALTER TABLE public.anime_data_attributions
    ADD CONSTRAINT anime_data_attributions_source_check
    CHECK (source IN ('anime_offline_database', 'jikan', 'wikidata', 'syobocal', 'mal'));
