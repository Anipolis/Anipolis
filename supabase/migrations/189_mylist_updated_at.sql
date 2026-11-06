-- ============================================================
-- 189_mylist_updated_at: マイリストを変えた日時を DB で記録する
-- ============================================================
-- user_anime_list.updated_at は登録した時のままで、保存しても動いていなかった（更新するトリガーが無く、
-- アプリも送っていない）。そのため「更新が新しい順」が、実際には登録順になっていた。
--
-- 方針:
--   * 状態・スコア・話数・開始日・完了日のどれかが変わったときだけ、今の時刻にする。
--     同じ内容の保存では動かさない。アプリが送った値は使わない（登録日時の 182 と同じ）。
--   * メモ（user_anime_notes）は別の表なので、変えても動かない。
--   * トレンド（anime_trending）は「この7日間でマイリストへの登録が多かった作品」なので、
--     これからは登録日時（created_at）で数える。話数を進めただけでは数えない。

CREATE OR REPLACE FUNCTION public.touch_mylist_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF (NEW.status, NEW.score, NEW.progress, NEW.started_on, NEW.finished_on)
       IS DISTINCT FROM (OLD.status, OLD.score, OLD.progress, OLD.started_on, OLD.finished_on) THEN
        NEW.updated_at := now();
    ELSE
        NEW.updated_at := OLD.updated_at;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.touch_mylist_updated_at() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS touch_mylist_updated_at ON public.user_anime_list;
CREATE TRIGGER touch_mylist_updated_at
    BEFORE UPDATE ON public.user_anime_list
    FOR EACH ROW EXECUTE FUNCTION public.touch_mylist_updated_at();

-- 列は変えないので、依存するビュー（anime_list_sortable など）は作り直さなくてよい
CREATE OR REPLACE VIEW public.anime_trending
WITH (security_invoker = true) AS
SELECT
    a.id AS anime_id,
    COUNT(ual.anime_id) AS recent_count
FROM public.anime a
LEFT JOIN public.user_anime_list ual
    ON ual.anime_id = a.id
    AND ual.created_at >= now() - interval '7 days'
    AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = ual.user_id AND p.list_is_public = true
    )
WHERE a.metadata_ready
    AND (NOT a.hidden_by_admin OR public.is_current_user_admin())
GROUP BY a.id;
