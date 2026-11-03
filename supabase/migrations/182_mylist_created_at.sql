-- ============================================================
-- 182_mylist_created_at: マイリストに登録した日時
-- ============================================================
-- マイリストの並び替え（登録が新しい順・古い順）に使う。これまでは最後に変えた日時（updated_at）
-- しか無かった。
--
-- 方針:
--   * 既存の登録は本当の登録日が分からないので、最後に変えた日時で埋める（近い値として）。
--   * 登録日時はサーバーが決める。登録したときは今の時刻、変えたときは前の値のまま
--     （アプリが送っても無視する。upsert の更新でも登録日時は動かない）。
--   * マイリストから外して入れ直したら、新しく登録したものとして扱う。

ALTER TABLE public.user_anime_list
    ADD COLUMN IF NOT EXISTS created_at timestamptz;

UPDATE public.user_anime_list
SET created_at = updated_at
WHERE created_at IS NULL;

ALTER TABLE public.user_anime_list
    ALTER COLUMN created_at SET DEFAULT now(),
    ALTER COLUMN created_at SET NOT NULL;

CREATE OR REPLACE FUNCTION public.keep_mylist_created_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.created_at := now();
    ELSE
        NEW.created_at := OLD.created_at;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS keep_mylist_created_at ON public.user_anime_list;
CREATE TRIGGER keep_mylist_created_at
    BEFORE INSERT OR UPDATE ON public.user_anime_list
    FOR EACH ROW EXECUTE FUNCTION public.keep_mylist_created_at();
