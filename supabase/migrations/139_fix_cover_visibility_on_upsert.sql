-- migration 136 / 138 のカバー表示トリガーが、upsert（INSERT ... ON CONFLICT DO UPDATE）で
-- © のある作品の画像まで消していたのを直す。
--
-- 原因: ON CONFLICT では、競合の判定より前に BEFORE INSERT が挿入候補の行に対して走る。
-- resolve:anime-catalog の upsert は copyright を含まないので、挿入候補の © は NULL と
-- 見なされ cover_url が NULL に隠される。その NULL が EXCLUDED.cover_url として既存行の
-- UPDATE に渡り、BEFORE UPDATE が「cover_url が書き換えられた」と解釈して
-- cover_source_url（画像の実体）まで NULL にしていた。
--
-- 修正: INSERT の段階では cover_url を隠さず（実体の取り込みだけ行い）、本当に新規に
-- 挿入された行だけ AFTER INSERT で隠し直す。ON CONFLICT DO UPDATE になった場合は
-- AFTER INSERT が発火しないので、UPDATE 側のトリガーが既存行の © で正しく判定する。
-- AFTER INSERT は同じ文の中で実行されるので、隠す前の状態が他から見えることはない。

CREATE OR REPLACE FUNCTION public.apply_anime_cover_visibility()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    -- 空文字・空白だけの © は「© なし」（NULL）として保存する（migration 138）
    IF NEW.copyright IS NOT NULL AND btrim(NEW.copyright) = '' THEN
        NEW.copyright := NULL;
    END IF;

    IF TG_OP = 'INSERT' THEN
        -- ここでは隠さない（upsert の競合更新に隠した値が渡るため）。新規行は
        -- AFTER INSERT（mask_inserted_anime_cover）で隠し直す
        NEW.cover_source_url := coalesce(NEW.cover_source_url, NEW.cover_url);
        RETURN NEW;
    END IF;

    IF NEW.cover_url IS DISTINCT FROM OLD.cover_url THEN
        -- cover_url への書き込みは画像の差し替え意図として実体へ取り込む
        NEW.cover_source_url := NEW.cover_url;
    END IF;

    NEW.cover_url := CASE
        WHEN NEW.copyright IS NOT NULL THEN NEW.cover_source_url
    END;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.mask_inserted_anime_cover()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    -- 新規行の表示用 cover_url を © の有無で決め直す（BEFORE UPDATE の判定を通す）
    IF NEW.cover_url IS DISTINCT FROM (CASE WHEN NEW.copyright IS NOT NULL THEN NEW.cover_source_url END) THEN
        EXECUTE format('UPDATE %s SET cover_url = cover_url WHERE id = $1', TG_RELID::regclass) USING NEW.id;
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS anime_mask_inserted_cover ON public.anime;
CREATE TRIGGER anime_mask_inserted_cover
AFTER INSERT ON public.anime
FOR EACH ROW
EXECUTE FUNCTION public.mask_inserted_anime_cover();
