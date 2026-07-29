-- Use canonical source status as a fallback when historical broadcast dates are incomplete.

DROP VIEW IF EXISTS public.anime_with_computed_broadcast_status;

CREATE VIEW public.anime_with_computed_broadcast_status
WITH (security_invoker = true) AS
SELECT
    anime.*,
    CASE
        -- Explicit dates drive automatic upcoming -> airing -> finished transitions.
        WHEN aired_from IS NOT NULL AND aired_from > (now() AT TIME ZONE 'Asia/Tokyo')::date
            THEN 'upcoming'
        WHEN aired_to IS NOT NULL AND aired_to < (now() AT TIME ZONE 'Asia/Tokyo')::date
            THEN 'finished'
        WHEN aired_from IS NOT NULL
            AND aired_from <= (now() AT TIME ZONE 'Asia/Tokyo')::date
            AND aired_to IS NOT NULL
            AND aired_to >= (now() AT TIME ZONE 'Asia/Tokyo')::date
            THEN 'airing'
        -- One-shot and finite release formats finish once their release date arrives.
        WHEN aired_to IS NULL
            AND regexp_replace(lower(coalesce(type, '')), '[^a-z0-9]', '', 'g')
                IN ('movie', 'ona', 'ova', 'tvspecial', 'special')
            AND (
                (aired_from IS NOT NULL
                    AND aired_from <= (now() AT TIME ZONE 'Asia/Tokyo')::date)
                OR status = 'airing'
            )
            THEN 'finished'
        -- Source status fills gaps such as historical TV entries without aired_to.
        WHEN status = 'finished'
            THEN 'finished'
        WHEN aired_from IS NOT NULL
            AND aired_from <= (now() AT TIME ZONE 'Asia/Tokyo')::date
            AND aired_to IS NULL
            THEN 'airing'
        WHEN status = 'upcoming'
            THEN 'upcoming'
        WHEN status = 'airing'
            THEN 'airing'
        ELSE 'unknown'
    END AS computed_broadcast_status
FROM public.anime;

GRANT SELECT ON public.anime_with_computed_broadcast_status TO anon, authenticated;
