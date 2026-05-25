-- ================================================================
-- 055_exchange_history_prune.sql
-- Prune old matched/cancelled exchange entries (keep 5 per user).
-- GC runs inside create_anime_exchange after each insert.
-- ================================================================

CREATE OR REPLACE FUNCTION public.create_anime_exchange(p_anime_id bigint)
RETURNS TABLE (
    exchange_id uuid,
    received_entry_id uuid,
    received_anime_id bigint
) AS $$
DECLARE
    current_user_id uuid := auth.uid();
    waiting_entry public.anime_exchange_entries%ROWTYPE;
    new_entry_id uuid;
BEGIN
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'login required';
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

    INSERT INTO public.anime_exchange_entries (user_id, anime_id)
    VALUES (current_user_id, p_anime_id)
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
    WITH ranked AS (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) AS rn
          FROM public.anime_exchange_entries
         WHERE user_id = current_user_id
           AND status IN ('matched', 'cancelled')
    )
    DELETE FROM public.anime_exchange_entries
     WHERE id IN (SELECT id FROM ranked WHERE rn > 5);

    RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
