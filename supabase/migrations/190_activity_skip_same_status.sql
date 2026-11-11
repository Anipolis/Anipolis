-- ============================================================
-- 190_activity_skip_same_status: 同じステータスに戻しただけでは、アクティビティを増やさない
-- ============================================================
-- 181 の record_mylist_activity は、ステータスが変わるたびに記録を作る。中断・断念は記録しないので、
-- 「視聴予定 → 中断 → 視聴予定」と変えると、30分を過ぎていれば「視聴予定に追加」が2つ並んでいた。
--
-- 方針:
--   * その作品の直近の記録が同じステータスなら、新しい記録を作らない（作り直しも、時刻の付け直しもしない）。
--   * そのときスコアが変わっていれば、181 と同じく直近の記録が24時間以内ならスコアだけ書き換える。
--   * 「視聴中 → 完了 → 視聴中」のように、間に記録されるステータスをはさむ場合は今までどおり記録する。
--   * 中断・断念から視聴中に戻した（再開）だけでは記録しない。

CREATE OR REPLACE FUNCTION public.record_mylist_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    latest public.mylist_activities%ROWTYPE;
BEGIN
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
