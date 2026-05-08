-- ================================================================
-- 032_anime_exchange.sql
-- Anonymous anime exchange pool.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.anime_exchange_entries (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    anime_id          bigint NOT NULL REFERENCES public.anime(id) ON DELETE CASCADE,
    status            text NOT NULL DEFAULT 'waiting'
                          CHECK (status IN ('waiting', 'matched', 'cancelled')),
    received_entry_id uuid REFERENCES public.anime_exchange_entries(id) ON DELETE SET NULL,
    created_at        timestamptz NOT NULL DEFAULT now(),
    matched_at        timestamptz,
    CHECK (received_entry_id IS NULL OR received_entry_id <> id)
);

CREATE INDEX IF NOT EXISTS idx_anime_exchange_entries_waiting
    ON public.anime_exchange_entries (created_at)
    WHERE status = 'waiting';

CREATE INDEX IF NOT EXISTS idx_anime_exchange_entries_user
    ON public.anime_exchange_entries (user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_anime_exchange_entries_one_waiting_per_user
    ON public.anime_exchange_entries (user_id)
    WHERE status = 'waiting';

ALTER TABLE public.anime_exchange_entries ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_select_anime_exchange_entry(entry_id uuid)
RETURNS boolean AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM public.anime_exchange_entries entry
        WHERE entry.id = entry_id
          AND (
              entry.user_id = auth.uid()
              OR EXISTS (
                  SELECT 1
                  FROM public.anime_exchange_entries own
                  WHERE own.user_id = auth.uid()
                    AND own.received_entry_id = entry.id
              )
          )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

DROP POLICY IF EXISTS "anime_exchange_entries: users can select own exchange results"
    ON public.anime_exchange_entries;

CREATE POLICY "anime_exchange_entries: users can select own exchange results"
    ON public.anime_exchange_entries FOR SELECT
    USING (public.can_select_anime_exchange_entry(id));

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

    IF EXISTS (
        SELECT 1
        FROM public.anime_exchange_entries
        WHERE user_id = current_user_id
          AND status = 'waiting'
    ) THEN
        RAISE EXCEPTION 'you already have a waiting exchange';
    END IF;

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
        RETURN NEXT;
        RETURN;
    END IF;

    exchange_id := new_entry_id;
    received_entry_id := NULL;
    received_anime_id := NULL;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.create_anime_exchange(bigint) TO authenticated;
