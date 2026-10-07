-- 権利表記（copyright）の空文字・空白だけの値を NULL にそろえる。
-- 初期登録の一部作品で copyright が '' になっており、取り込み（collect:copyright /
-- import:annict）は「NULL の作品」だけを埋めるため素通りしていた。一方カバーの表示
-- 判定（migration 136）は空白も「© なし」とみなすので、画像が隠れたまま残っていた。
-- 書き込みのたびに BEFORE トリガーで正規化し、取り込みと表示判定の「空」を一致させる。

UPDATE public.anime
SET copyright = NULL
WHERE copyright IS NOT NULL AND btrim(copyright) = '';

CREATE OR REPLACE FUNCTION public.apply_anime_cover_visibility()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    -- 空文字・空白だけの © は「© なし」（NULL）として保存する
    IF NEW.copyright IS NOT NULL AND btrim(NEW.copyright) = '' THEN
        NEW.copyright := NULL;
    END IF;

    IF TG_OP = 'INSERT' THEN
        NEW.cover_source_url := coalesce(NEW.cover_source_url, NEW.cover_url);
    ELSIF NEW.cover_url IS DISTINCT FROM OLD.cover_url THEN
        -- cover_url への書き込みは画像の差し替え意図として実体へ取り込む
        NEW.cover_source_url := NEW.cover_url;
    END IF;

    NEW.cover_url := CASE
        WHEN NEW.copyright IS NOT NULL THEN NEW.cover_source_url
    END;
    RETURN NEW;
END;
$$;
