-- しょぼいのTitleYomi(タイトル読み)をカタログへ反映するための列。
-- リゾルバが syobocal ソースレコードの title_yomi から解決する
-- (use_for_title=false のマッピングでは収集されないため null のまま)。
-- 五十音ソート等の将来利用を見込んだデータ整備で、UI消費はまだ無い。

ALTER TABLE public.anime
    ADD COLUMN IF NOT EXISTS title_yomi text;

COMMENT ON COLUMN public.anime.title_yomi IS
    'Japanese reading (yomi) of the title, resolved from Syobocal TitleYomi.';

-- anime.* を展開したビューは作成時点の列で固定されるため、
-- 新列を含めて再作成する(定義は migration 122 と同一)。
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
