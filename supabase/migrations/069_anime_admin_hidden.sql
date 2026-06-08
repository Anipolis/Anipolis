-- Hide selected anime from regular users while keeping them importable by MAL ID.

ALTER TABLE public.anime
    ADD COLUMN IF NOT EXISTS hidden_by_admin boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS anime_hidden_by_admin_idx
    ON public.anime (hidden_by_admin);

DO $$
DECLARE policy_name text;
BEGIN
    FOR policy_name IN
        SELECT polname FROM pg_policy
        WHERE polrelid = 'public.anime'::regclass AND polcmd = 'r'
    LOOP
        EXECUTE format('DROP POLICY %I ON public.anime', policy_name);
    END LOOP;
END $$;

CREATE POLICY "anime: visible unless hidden by admin"
    ON public.anime FOR SELECT
    USING (NOT hidden_by_admin OR public.is_current_user_admin());

DROP POLICY IF EXISTS "anime: admin can update" ON public.anime;
CREATE POLICY "anime: admin can update"
    ON public.anime FOR UPDATE
    USING (public.is_current_user_admin())
    WITH CHECK (public.is_current_user_admin());

DROP VIEW IF EXISTS public.anime_with_computed_broadcast_status;

CREATE VIEW public.anime_with_computed_broadcast_status
WITH (security_invoker = true) AS
SELECT
  anime.*,
  CASE
    WHEN aired_from IS NOT NULL AND aired_from > (now() AT TIME ZONE 'Asia/Tokyo')::date
      THEN 'upcoming'
    WHEN aired_to IS NOT NULL AND aired_to < (now() AT TIME ZONE 'Asia/Tokyo')::date
      THEN 'finished'
    WHEN aired_from IS NOT NULL
      AND aired_from <= (now() AT TIME ZONE 'Asia/Tokyo')::date
      AND aired_to IS NULL
      AND regexp_replace(lower(coalesce(type, '')), '[^a-z0-9]', '', 'g') IN ('movie', 'ona', 'ova', 'tvspecial', 'special')
      THEN 'finished'
    WHEN aired_from IS NOT NULL
      AND aired_from <= (now() AT TIME ZONE 'Asia/Tokyo')::date
      AND (aired_to IS NULL OR aired_to >= (now() AT TIME ZONE 'Asia/Tokyo')::date)
      THEN 'airing'
    ELSE 'unknown'
  END AS computed_broadcast_status
FROM public.anime;

GRANT SELECT ON public.anime_with_computed_broadcast_status TO anon, authenticated;

CREATE OR REPLACE VIEW public.anime_popularity
WITH (security_invoker = true) AS
SELECT
  a.id AS anime_id,
  COUNT(ual.anime_id) AS list_count
FROM public.anime a
LEFT JOIN public.user_anime_list ual ON ual.anime_id = a.id
WHERE NOT a.hidden_by_admin OR public.is_current_user_admin()
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
WHERE NOT a.hidden_by_admin OR public.is_current_user_admin()
GROUP BY a.id;

CREATE OR REPLACE VIEW public.anime_top_rated
WITH (security_invoker = true) AS
SELECT
  a.id AS anime_id,
  COALESCE(AVG(ual.score) FILTER (WHERE ual.score IS NOT NULL), 0) AS avg_score,
  COUNT(ual.score) FILTER (WHERE ual.score IS NOT NULL) AS score_count
FROM public.anime a
LEFT JOIN public.user_anime_list ual ON ual.anime_id = a.id
WHERE NOT a.hidden_by_admin OR public.is_current_user_admin()
GROUP BY a.id;

GRANT SELECT ON public.anime_popularity TO anon, authenticated;
GRANT SELECT ON public.anime_trending TO anon, authenticated;
GRANT SELECT ON public.anime_top_rated TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_anime_exchange(p_anime_id bigint, p_comment text DEFAULT NULL)
RETURNS TABLE (
    exchange_id uuid,
    received_entry_id uuid,
    received_anime_id bigint
) AS $$
DECLARE
    current_user_id uuid := auth.uid();
    waiting_entry public.anime_exchange_entries%ROWTYPE;
    new_entry_id uuid;
    normalized_comment text := NULLIF(trim(p_comment), '');
BEGIN
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'login required';
    END IF;

    IF normalized_comment IS NOT NULL AND char_length(normalized_comment) > 120 THEN
        RAISE EXCEPTION 'comment too long';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM public.anime
         WHERE id = p_anime_id
           AND (NOT hidden_by_admin OR public.is_current_user_admin())
    ) THEN
        RAISE EXCEPTION 'anime not found';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('public.anime_exchange_entries'));

    SELECT *
      INTO waiting_entry
      FROM public.anime_exchange_entries entry
     WHERE entry.status = 'waiting'
       AND entry.user_id <> current_user_id
       AND EXISTS (
           SELECT 1
             FROM public.anime anime
            WHERE anime.id = entry.anime_id
              AND (NOT anime.hidden_by_admin OR public.is_current_user_admin())
       )
     ORDER BY entry.created_at ASC
     LIMIT 1
     FOR UPDATE SKIP LOCKED;

    INSERT INTO public.anime_exchange_entries (user_id, anime_id, comment)
    VALUES (current_user_id, p_anime_id, normalized_comment)
    RETURNING id INTO new_entry_id;

    IF waiting_entry.id IS NOT NULL THEN
        UPDATE public.anime_exchange_entries
           SET status = 'matched',
               received_entry_id = waiting_entry.id,
               matched_at = now()
         WHERE id = new_entry_id;

        UPDATE public.anime_exchange_entries
           SET status = 'matched',
               received_entry_id = new_entry_id,
               matched_at = now()
         WHERE id = waiting_entry.id;

        exchange_id := new_entry_id;
        received_entry_id := waiting_entry.id;
        received_anime_id := waiting_entry.anime_id;
    ELSE
        exchange_id := new_entry_id;
        received_entry_id := NULL;
        received_anime_id := NULL;
    END IF;

    DELETE FROM public.anime_exchange_entries
     WHERE user_id = current_user_id
       AND status IN ('matched', 'cancelled')
       AND id NOT IN (
           SELECT id FROM public.anime_exchange_entries
            WHERE user_id = current_user_id
              AND status IN ('matched', 'cancelled')
            ORDER BY created_at DESC
            LIMIT 5
       );

    RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.create_anime_exchange(bigint, text) TO authenticated;
