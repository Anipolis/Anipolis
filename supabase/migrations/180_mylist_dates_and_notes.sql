-- ============================================================
-- 180_mylist_dates_and_notes: マイリストの「見始めた日・見終えた日」と自分用のメモ
-- ============================================================
-- マイリストには視聴ステータス・スコア・進捗しか無く、いつ見たか、なぜそうしたかを残せなかった。
--
-- 方針:
--   * 見始めた日・見終えた日は user_anime_list の列（日単位、時刻は持たない）。見える人は
--     視聴ステータスと同じ（119 のマイリストの公開設定）。
--   * 「視聴中」にしたら見始めた日、「完了」にしたら見終えた日を、空のときだけ今日（日本時間）で
--     埋める。アニメ一覧の小さい欄など、日付を送らない保存でも入るようにトリガーで行う。
--     既存の登録は空のまま（登録した日を見始めた日とみなすと実際と違うことが多い）。
--   * メモは本人だけが読める。user_anime_list は公開リストなら他人も読めるので、列ではなく
--     別の表にする。マイリストから外したら一緒に消える（外部キーの ON DELETE CASCADE）。
--   * メモは他人に見えない書き込みなので、130 の方針どおり β 権限だけを求める。

ALTER TABLE public.user_anime_list
    ADD COLUMN IF NOT EXISTS started_on date,
    ADD COLUMN IF NOT EXISTS finished_on date;

ALTER TABLE public.user_anime_list
    DROP CONSTRAINT IF EXISTS user_anime_list_watch_dates_order;
ALTER TABLE public.user_anime_list
    ADD CONSTRAINT user_anime_list_watch_dates_order
    CHECK (started_on IS NULL OR finished_on IS NULL OR started_on <= finished_on);

-- 視聴ステータスが変わったときだけ、空の日付を今日（日本時間）で埋める
CREATE OR REPLACE FUNCTION public.fill_mylist_watch_dates()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    today date := (now() AT TIME ZONE 'Asia/Tokyo')::date;
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
        RETURN NEW;
    END IF;
    -- アプリの保存は upsert（INSERT ... ON CONFLICT DO UPDATE）なので、登録済みの作品でも先に
    -- INSERT のトリガーが走る。ここで埋めると、ステータスを変えていない保存でも空の日付が今日になる。
    -- 登録済みなら何もせず、続く UPDATE のトリガー（ステータスが変わったときだけ）に任せる
    IF TG_OP = 'INSERT' AND EXISTS (
        SELECT 1 FROM public.user_anime_list
        WHERE user_id = NEW.user_id AND anime_id = NEW.anime_id
    ) THEN
        RETURN NEW;
    END IF;

    IF NEW.status = 'watching' AND NEW.started_on IS NULL THEN
        -- 見終えた日が今日より前に入っていたら（見直しで「視聴中」に戻したときなど）、順番の制約に反するので埋めない
        IF NEW.finished_on IS NULL OR NEW.finished_on >= today THEN
            NEW.started_on := today;
        END IF;
    ELSIF NEW.status = 'completed' AND NEW.finished_on IS NULL THEN
        -- 見始めた日が今日より後に手で入っていたら、順番の制約に反するので埋めない
        IF NEW.started_on IS NULL OR NEW.started_on <= today THEN
            NEW.finished_on := today;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fill_mylist_watch_dates ON public.user_anime_list;
CREATE TRIGGER fill_mylist_watch_dates
    BEFORE INSERT OR UPDATE OF status ON public.user_anime_list
    FOR EACH ROW EXECUTE FUNCTION public.fill_mylist_watch_dates();

-- ---------- 自分用のメモ ----------
CREATE TABLE IF NOT EXISTS public.user_anime_notes (
    user_id    uuid        NOT NULL,
    anime_id   bigint      NOT NULL,
    body       text        NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, anime_id),
    CONSTRAINT user_anime_notes_entry_fkey
        FOREIGN KEY (user_id, anime_id)
        REFERENCES public.user_anime_list (user_id, anime_id)
        ON DELETE CASCADE,
    CONSTRAINT user_anime_notes_body_length CHECK (char_length(body) BETWEEN 1 AND 1000)
);

ALTER TABLE public.user_anime_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_anime_notes: 本人だけ読める" ON public.user_anime_notes;
CREATE POLICY "user_anime_notes: 本人だけ読める"
    ON public.user_anime_notes FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_anime_notes: 本人だけ追加できる" ON public.user_anime_notes;
CREATE POLICY "user_anime_notes: 本人だけ追加できる"
    ON public.user_anime_notes FOR INSERT
    WITH CHECK (auth.uid() = user_id AND public.has_beta_write_access());

DROP POLICY IF EXISTS "user_anime_notes: 本人だけ更新できる" ON public.user_anime_notes;
CREATE POLICY "user_anime_notes: 本人だけ更新できる"
    ON public.user_anime_notes FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id AND public.has_beta_write_access());

DROP POLICY IF EXISTS "user_anime_notes: 本人だけ消せる" ON public.user_anime_notes;
CREATE POLICY "user_anime_notes: 本人だけ消せる"
    ON public.user_anime_notes FOR DELETE
    USING (auth.uid() = user_id);

REVOKE ALL ON public.user_anime_notes FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_anime_notes TO authenticated;
