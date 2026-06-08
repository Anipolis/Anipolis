-- ================================================================
-- 068_anime_exchange_comments.sql
-- Add short comments to anonymous anime exchanges.
-- ================================================================

ALTER TABLE public.anime_exchange_entries
ADD COLUMN IF NOT EXISTS comment text;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'anime_exchange_entries_comment_length'
          AND conrelid = 'public.anime_exchange_entries'::regclass
    ) THEN
        ALTER TABLE public.anime_exchange_entries
        ADD CONSTRAINT anime_exchange_entries_comment_length
        CHECK (comment IS NULL OR char_length(comment) <= 120);
    END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.create_anime_exchange(bigint);

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

    IF NOT EXISTS (SELECT 1 FROM public.anime WHERE id = p_anime_id) THEN
        RAISE EXCEPTION 'anime not found';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('public.anime_exchange_entries'));

    SELECT *
      INTO waiting_entry
      FROM public.anime_exchange_entries
     WHERE status = 'waiting'
       AND user_id <> current_user_id
     ORDER BY created_at ASC
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

    -- Prune old matched/cancelled entries, keeping the 5 most recent.
    -- ON DELETE SET NULL handles any partner references gracefully.
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
