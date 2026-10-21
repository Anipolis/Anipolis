-- ============================================================
-- 152_anime_episode_total: 話数を整数で持つ列を追加する（#354）
-- ============================================================
-- anime.episode_count は 044 で text になっている（CSV 取り込みで空欄を許すため）。話数の比較や
-- 計算（話数ルームの範囲、進捗の上限）を DB で書くには整数が要る。
--
-- 列の型を直接変えると、anime を * で引き継ぐビュー（anime_with_computed_broadcast_status →
-- 144 / 145）を作り直す必要があり、本番のアプリ（master）は今も text の列を読み書きしている。
-- そこで整数の列 episode_total を足し、episode_count からトリガーで同期する。
--   * 既存の列・ビュー・アプリには触れないので、今の本番アプリと互換
--   * 新しいコード（話数ルームなど）は episode_total を使う
--   * 書き込み側を episode_total に移し終えたら、episode_count とこのトリガーを外し、
--     ビューを作り直す（別 migration）
--   * 044 の CHECK で episode_count は NULL・空文字・正の整数のどれか。ただし桁数の制限が無いので、
--     integer に収まる9桁まで（999,999,999）だけを変換し、それより大きい値は NULL にする（変換の失敗で
--     migration や書き込みが止まらないように）

ALTER TABLE public.anime
    ADD COLUMN IF NOT EXISTS episode_total integer
    CHECK (episode_total IS NULL OR episode_total > 0);

COMMENT ON COLUMN public.anime.episode_total IS
    'Integer episode count, kept in sync from episode_count (text) by trigger until writers move to this column.';

CREATE OR REPLACE FUNCTION public.sync_anime_episode_total()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.episode_total := CASE
        WHEN NEW.episode_count ~ '^[1-9][0-9]{0,8}$' THEN NEW.episode_count::integer
        ELSE NULL
    END;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_anime_episode_total ON public.anime;
CREATE TRIGGER sync_anime_episode_total
    BEFORE INSERT OR UPDATE OF episode_count, episode_total ON public.anime
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_anime_episode_total();

-- 既存の行を埋める（トリガーは UPDATE OF episode_count で動かさず、直接計算する）
UPDATE public.anime
   SET episode_total = CASE
        WHEN episode_count ~ '^[1-9][0-9]{0,8}$' THEN episode_count::integer
        ELSE NULL
    END
 WHERE episode_total IS DISTINCT FROM CASE
        WHEN episode_count ~ '^[1-9][0-9]{0,8}$' THEN episode_count::integer
        ELSE NULL
    END;
