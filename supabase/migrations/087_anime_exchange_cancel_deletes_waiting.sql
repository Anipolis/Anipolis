-- ================================================================
-- 087_anime_exchange_cancel_deletes_waiting.sql
-- Cancelling an unmatched waiting exchange should not create history.
-- ================================================================

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

    DELETE FROM public.anime_exchange_entries
     WHERE user_id = current_user_id
       AND status = 'waiting';

    GET DIAGNOSTICS cancelled_count = ROW_COUNT;
    cancelled := cancelled_count > 0;

    RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.cancel_anime_exchange() TO authenticated;

DELETE FROM public.anime_exchange_entries
 WHERE status = 'cancelled'
   AND received_entry_id IS NULL;

NOTIFY pgrst, 'reload schema';
