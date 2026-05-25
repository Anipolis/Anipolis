-- Store anime-to-anime relations imported from Jikan/MAL.
-- Related entries may not be imported locally yet, so their MAL IDs are retained without a foreign key.

CREATE TABLE IF NOT EXISTS public.anime_relations (
  anime_mal_id         bigint      NOT NULL REFERENCES public.anime(mal_id) ON DELETE CASCADE,
  related_anime_mal_id bigint      NOT NULL,
  relation_type        text        NOT NULL,
  related_title        text        NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (anime_mal_id, related_anime_mal_id, relation_type),
  CHECK (anime_mal_id <> related_anime_mal_id)
);

CREATE INDEX IF NOT EXISTS anime_relations_related_mal_id_idx
  ON public.anime_relations (related_anime_mal_id);

ALTER TABLE public.anime_relations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anime_relations: public read"
  ON public.anime_relations
  FOR SELECT
  USING (true);
