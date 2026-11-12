-- ============================================================
-- 202_mylist_import: マイリストの一括取り込み（MyAnimeList などから、#358）
-- ============================================================
-- 他のサービスから移ってくる人が、視聴記録を手で入れ直さなくて済むようにする。
-- アプリ（/api/mylist/import）がファイルを読み、作品を mal_id で突き合わせてから、この関数に渡す。
--
-- 方針:
--   * SECURITY INVOKER。書き込みはふだんの保存と同じ RLS（本人だけ・利用制限中は不可）を通る。
--   * 1 回に渡せるのは 500 件まで。アプリが分けて呼ぶ。
--   * 取り込みの最中は、トランザクション内だけの設定 anipolis.mylist_import = on を立て、
--       - アクティビティ（record_mylist_activity）を作らない。数百件の「完了」がフォロワーのタイムラインに流れるため
--       - 日付の自動入力（fill_mylist_watch_dates）をしない。取り込んだ「完了」が今日見終えたことになるため
--     この設定はこの関数の中でだけ立つ（PostgREST から set_config は呼べない）。
--   * 登録済みの作品は、p_overwrite が false なら残し、true なら取り込んだ値で上書きする。
--     上書きでも、取り込み側に無いスコア・日付は今の値を残す（空で消さない）。
--   * 戻り値は { inserted, updated, skipped }。

CREATE OR REPLACE FUNCTION public.import_mylist_entries(p_entries jsonb, p_overwrite boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    uid uuid := auth.uid();
    total integer;
    inserted_count integer := 0;
    updated_count integer := 0;
BEGIN
    IF uid IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;
    IF jsonb_typeof(p_entries) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'entries must be an array' USING ERRCODE = '22023';
    END IF;
    total := jsonb_array_length(p_entries);
    IF total > 500 THEN
        RAISE EXCEPTION 'too many entries (max 500)' USING ERRCODE = '22023';
    END IF;
    IF total = 0 THEN
        RETURN jsonb_build_object('inserted', 0, 'updated', 0, 'skipped', 0);
    END IF;

    PERFORM set_config('anipolis.mylist_import', 'on', true);

    WITH src AS (
        SELECT DISTINCT ON (e.anime_id)
            e.anime_id, e.status, e.score, GREATEST(COALESCE(e.progress, 0), 0) AS progress, e.started_on, e.finished_on
        FROM jsonb_to_recordset(p_entries)
            AS e(anime_id integer, status text, score smallint, progress integer, started_on date, finished_on date)
        WHERE e.anime_id IS NOT NULL
        ORDER BY e.anime_id
    ),
    written AS (
        INSERT INTO public.user_anime_list AS l (user_id, anime_id, status, score, progress, started_on, finished_on)
        SELECT uid, s.anime_id, s.status, s.score, s.progress, s.started_on, s.finished_on
        FROM src s
        ON CONFLICT (user_id, anime_id) DO UPDATE
            SET status = EXCLUDED.status,
                score = COALESCE(EXCLUDED.score, l.score),
                progress = EXCLUDED.progress,
                started_on = COALESCE(EXCLUDED.started_on, l.started_on),
                finished_on = COALESCE(EXCLUDED.finished_on, l.finished_on)
            WHERE p_overwrite
        RETURNING (xmax = 0) AS is_insert
    )
    SELECT count(*) FILTER (WHERE is_insert), count(*) FILTER (WHERE NOT is_insert)
    INTO inserted_count, updated_count
    FROM written;

    PERFORM set_config('anipolis.mylist_import', 'off', true);

    RETURN jsonb_build_object(
        'inserted', inserted_count,
        'updated', updated_count,
        'skipped', total - inserted_count - updated_count
    );
END;
$$;

REVOKE ALL ON FUNCTION public.import_mylist_entries(jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_mylist_entries(jsonb, boolean) TO authenticated;

-- ---------- 日付の自動入力（180）: 取り込み中はしない ----------
CREATE OR REPLACE FUNCTION public.fill_mylist_watch_dates()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    today date := (now() AT TIME ZONE 'Asia/Tokyo')::date;
BEGIN
    -- 一括取り込み（202）の日付はファイルの値をそのまま使う
    IF current_setting('anipolis.mylist_import', true) = 'on' THEN
        RETURN NEW;
    END IF;
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

-- ---------- アクティビティ（190）: 取り込み中は作らない ----------
CREATE OR REPLACE FUNCTION public.record_mylist_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    latest public.mylist_activities%ROWTYPE;
BEGIN
    -- 一括取り込み（202）は、フォロワーのタイムラインに流さない
    IF current_setting('anipolis.mylist_import', true) = 'on' THEN
        RETURN NEW;
    END IF;
    IF NEW.status NOT IN ('plan_to_watch', 'watching', 'completed') THEN
        RETURN NEW;
    END IF;

    SELECT * INTO latest
    FROM public.mylist_activities
    WHERE user_id = NEW.user_id AND anime_id = NEW.anime_id
    ORDER BY created_at DESC, id DESC
    LIMIT 1;

    IF (TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status)
       AND (latest.id IS NULL OR latest.status IS DISTINCT FROM NEW.status)
    THEN
        IF latest.id IS NOT NULL
           AND latest.created_at > now() - interval '30 minutes'
           AND NOT EXISTS (SELECT 1 FROM public.mylist_activity_likes l WHERE l.activity_id = latest.id)
        THEN
            UPDATE public.mylist_activities
            SET status = NEW.status, score = NEW.score, created_at = now()
            WHERE id = latest.id;
        ELSE
            INSERT INTO public.mylist_activities (user_id, anime_id, status, score)
            VALUES (NEW.user_id, NEW.anime_id, NEW.status, NEW.score);
        END IF;
    ELSIF NEW.score IS DISTINCT FROM (CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.score END)
          AND latest.id IS NOT NULL
          AND latest.status = NEW.status
          AND latest.created_at > now() - interval '24 hours'
    THEN
        UPDATE public.mylist_activities SET score = NEW.score WHERE id = latest.id;
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.record_mylist_activity() FROM PUBLIC, anon, authenticated;
