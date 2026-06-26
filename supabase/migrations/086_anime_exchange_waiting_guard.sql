-- ================================================================
-- 086_anime_exchange_waiting_guard.sql
-- Keep one active waiting exchange per user and add cancellation RPC.
-- ================================================================

CREATE OR REPLACE FUNCTION public.create_anime_exchange(
    p_anime_id bigint,
    p_comment text DEFAULT NULL,
    p_subjective_tags text[] DEFAULT ARRAY[]::text[]
)
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
    normalized_subjective_tags text[] := ARRAY[]::text[];
BEGIN
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'login required';
    END IF;

    IF normalized_comment IS NOT NULL AND char_length(normalized_comment) > 120 THEN
        RAISE EXCEPTION 'comment too long';
    END IF;

    WITH normalized AS (
        SELECT trim(input.tag) AS tag, min(input.ordinal) AS ordinal
          FROM unnest(COALESCE(p_subjective_tags, ARRAY[]::text[])) WITH ORDINALITY AS input(tag, ordinal)
         WHERE trim(input.tag) <> ''
         GROUP BY trim(input.tag)
    )
    SELECT COALESCE(array_agg(tag ORDER BY ordinal), ARRAY[]::text[])
      INTO normalized_subjective_tags
      FROM normalized;

    IF cardinality(normalized_subjective_tags) > 3 THEN
        RAISE EXCEPTION 'too many subjective tags';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM unnest(normalized_subjective_tags) AS selected(tag)
         WHERE NOT (selected.tag = ANY (ARRAY[
            '泣ける',
            '心温まる',
            '胸熱',
            '燃える',
            '尊い',
            '癒される',
            '切ない',
            '感動',
            '爽快',
            'ドキドキ',
            '怖い',
            '狂気',
            '脳破壊',
            '考察したくなる',
            '中毒性高い',
            '哲学的',
            '笑える',
            '美しい',
            '学び',
            '懐かしい'
         ]::text[]))
    ) THEN
        RAISE EXCEPTION 'invalid subjective tag';
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

    IF EXISTS (
        SELECT 1
          FROM public.anime_exchange_entries entry
         WHERE entry.user_id = current_user_id
           AND entry.status = 'waiting'
    ) THEN
        RAISE EXCEPTION 'you already have a waiting exchange';
    END IF;

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

    INSERT INTO public.anime_exchange_entries (user_id, anime_id, comment, subjective_tags)
    VALUES (current_user_id, p_anime_id, normalized_comment, normalized_subjective_tags)
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

GRANT EXECUTE ON FUNCTION public.create_anime_exchange(bigint, text, text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_anime_exchange()
RETURNS TABLE (
    cancelled boolean,
    cancelled_count integer
) AS $$
DECLARE
    current_user_id uuid := auth.uid();
BEGIN
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'login required';
    END IF;

    UPDATE public.anime_exchange_entries
       SET status = 'cancelled'
     WHERE user_id = current_user_id
       AND status = 'waiting';

    GET DIAGNOSTICS cancelled_count = ROW_COUNT;
    cancelled := cancelled_count > 0;

    RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.cancel_anime_exchange() TO authenticated;

NOTIFY pgrst, 'reload schema';
