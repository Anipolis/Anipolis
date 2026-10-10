-- 権利表記（©）の無い作品はカバー画像を表示しない。
-- 読み出し側（各クエリ・埋め込み・RPC）を個別に直すと漏れるため、DB側で
-- anime.cover_url そのものを「© がある作品だけ値が入る」列にする:
-- - 画像の実体URLは新しい列 cover_source_url に保持する。
-- - BEFORE トリガーで cover_url = (© があれば cover_source_url、無ければ NULL) に揃える。
--   © が後から入れば画像も自動で表示され、© を消せば隠れる。
-- - 書き込み側は従来どおり cover_url に書けばよい（トリガーが cover_source_url へ
--   取り込む）。ただし © の無い作品で cover_url に NULL を書いても実体は消えない
--   （隠れている値と区別できないため）。実体を消すときは cover_source_url を直接更新する。
-- なお cover_source_url は公開テーブルの列なので API からは読める。目的は表示の
-- 制御で、ストレージ上の画像は従来どおり公開されている。

ALTER TABLE public.anime
    ADD COLUMN IF NOT EXISTS cover_source_url text;

COMMENT ON COLUMN public.anime.cover_source_url IS
    'Stored cover image URL. anime.cover_url exposes it only when the title has a copyright notice.';

UPDATE public.anime
SET cover_source_url = cover_url
WHERE cover_source_url IS NULL AND cover_url IS NOT NULL;

-- トリガー作成前に隠す（作成後に cover_url を NULL へ更新すると実体まで消えるため）
UPDATE public.anime
SET cover_url = NULL
WHERE cover_url IS NOT NULL AND nullif(btrim(coalesce(copyright, '')), '') IS NULL;

CREATE OR REPLACE FUNCTION public.apply_anime_cover_visibility()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.cover_source_url := coalesce(NEW.cover_source_url, NEW.cover_url);
    ELSIF NEW.cover_url IS DISTINCT FROM OLD.cover_url THEN
        -- cover_url への書き込みは画像の差し替え意図として実体へ取り込む
        NEW.cover_source_url := NEW.cover_url;
    END IF;

    NEW.cover_url := CASE
        WHEN nullif(btrim(coalesce(NEW.copyright, '')), '') IS NOT NULL THEN NEW.cover_source_url
    END;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS anime_apply_cover_visibility ON public.anime;
CREATE TRIGGER anime_apply_cover_visibility
BEFORE INSERT OR UPDATE ON public.anime
FOR EACH ROW
EXECUTE FUNCTION public.apply_anime_cover_visibility();

-- 管理画面編集の manual ソース自動キャプチャは、表示用に隠れた cover_url ではなく
-- 画像の実体 cover_source_url を記録する（定義は migration 124 と同一、cover の参照のみ変更）。
CREATE OR REPLACE FUNCTION public.capture_anime_manual_source()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_data jsonb;
    previous_data jsonb;
    manual_data jsonb;
    field_name text;
    has_changes boolean := false;
BEGIN
    IF NEW.mal_id IS NULL OR auth.uid() IS NULL OR NOT public.is_current_user_admin() THEN
        RETURN NEW;
    END IF;

    current_data := jsonb_build_object(
        'mal_id', NEW.mal_id,
        'title', NEW.title,
        'title_en', NEW.title_en,
        'title_romaji', NEW.title_romaji,
        'episode_count', NEW.episode_count,
        'type', NEW.type,
        'status', NEW.status,
        'aired_from', NEW.aired_from,
        'aired_to', NEW.aired_to,
        'season', NEW.season,
        'source', NEW.source,
        'studio', NEW.studio,
        'studio_en', NEW.studio_en,
        'genre', NEW.genre,
        'genre_en', NEW.genre_en,
        'broadcast_day', NEW.broadcast_day,
        'broadcast_time', NEW.broadcast_time,
        'broadcast_station', NEW.broadcast_station,
        'broadcast_duration_minutes', NEW.broadcast_duration_minutes,
        'official_site_url', NEW.official_site_url,
        'official_x_url', NEW.official_x_url,
        'resources', NEW.resources,
        'cover_url', NEW.cover_source_url
    );

    IF TG_OP = 'INSERT' THEN
        manual_data := current_data;
        has_changes := true;
    ELSE
        previous_data := jsonb_build_object(
            'mal_id', OLD.mal_id,
            'title', OLD.title,
            'title_en', OLD.title_en,
            'title_romaji', OLD.title_romaji,
            'episode_count', OLD.episode_count,
            'type', OLD.type,
            'status', OLD.status,
            'aired_from', OLD.aired_from,
            'aired_to', OLD.aired_to,
            'season', OLD.season,
            'source', OLD.source,
            'studio', OLD.studio,
            'studio_en', OLD.studio_en,
            'genre', OLD.genre,
            'genre_en', OLD.genre_en,
            'broadcast_day', OLD.broadcast_day,
            'broadcast_time', OLD.broadcast_time,
            'broadcast_station', OLD.broadcast_station,
            'broadcast_duration_minutes', OLD.broadcast_duration_minutes,
            'official_site_url', OLD.official_site_url,
            'official_x_url', OLD.official_x_url,
            'resources', OLD.resources,
            'cover_url', OLD.cover_source_url
        );
        SELECT normalized_data
        INTO manual_data
        FROM public.anime_source_records
        WHERE mal_id = NEW.mal_id AND source = 'manual';
        manual_data := coalesce(manual_data, jsonb_build_object('mal_id', NEW.mal_id));

        FOR field_name IN SELECT jsonb_object_keys(current_data)
        LOOP
            IF field_name <> 'mal_id'
                AND (current_data -> field_name) IS DISTINCT FROM (previous_data -> field_name)
            THEN
                manual_data := manual_data || jsonb_build_object(field_name, current_data -> field_name);
                has_changes := true;
            END IF;
        END LOOP;
    END IF;

    IF NOT has_changes THEN
        RETURN NEW;
    END IF;

    INSERT INTO public.anime_source_records (
        mal_id,
        source,
        source_version,
        source_url,
        source_updated_at,
        normalized_data,
        imported_at
    ) VALUES (
        NEW.mal_id,
        'manual',
        'admin-v1',
        'internal://anime-admin',
        CURRENT_DATE,
        manual_data,
        now()
    )
    ON CONFLICT (mal_id, source) DO UPDATE SET
        source_version = EXCLUDED.source_version,
        source_url = EXCLUDED.source_url,
        source_updated_at = EXCLUDED.source_updated_at,
        normalized_data = EXCLUDED.normalized_data,
        imported_at = EXCLUDED.imported_at;

    RETURN NEW;
END;
$$;

-- anime.* を展開したビューは作成時点の列で固定されるため、
-- 新列を含めて再作成する(定義は migration 125 と同一)。
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
