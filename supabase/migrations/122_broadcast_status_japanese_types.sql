-- 管理画面の手動登録は type に日本語ラベル（映画/特別）を使うが、
-- computed_broadcast_status の有限リリース形式判定は英数字正規化
-- （regexp_replace で日本語が空文字になる）しか見ておらず、aired_to が NULL の
-- 劇場作品等が「放送中」判定になっていた。日本語ラベルも判定に含める。
-- （TS側ミラーの src/lib/broadcast-status.ts も同時に修正済み）
-- 107_anime_computed_broadcast_status_with_source_status.sql の完全な置き換え。

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
            AND (
                regexp_replace(lower(coalesce(type, '')), '[^a-z0-9]', '', 'g')
                    IN ('movie', 'ona', 'ova', 'tvspecial', 'special')
                OR btrim(coalesce(type, '')) IN ('映画', '特別')
            )
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
