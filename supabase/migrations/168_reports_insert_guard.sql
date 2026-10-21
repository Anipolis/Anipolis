-- ============================================================
-- 168_reports_insert_guard: 通報の作成時に、状態・解決情報・時刻・対象の持ち主を DB で決める（#237）
-- ============================================================
-- 通報 API（/api/reports）は対象を確かめ、必要な列だけを INSERT している。しかし INSERT のポリシーは
-- 「reporter_id が自分」しか見ないので、Supabase の REST API に直接 INSERT すれば次の値を好きに入れられた。
--   * status（解決済みを装う。reports_open_unique_idx は open / reviewing だけが対象なので、重複の検査も外れる）
--   * resolved_by / resolved_at、created_at / updated_at（監査の記録を偽る）
--   * target_user_id（対象の投稿の持ち主と違う人を指す）、存在しない対象
--
-- 利用者（anon / authenticated）からの INSERT では、トリガーで次のように決める。
--   * status は 'open'、resolved_by / resolved_at は NULL、created_at / updated_at はサーバーの時刻
--   * target_user_id は対象から導く（投稿ならその投稿者、ユーザーならその人）。対象が無ければ拒否する
-- 投稿の存在は呼び出した人の権限（RLS）で確かめる。見えない投稿（鍵・非表示・ブロック）は通報 API と同じく
-- 「見つからない」とし、通報を通して見えない投稿の有無を探れないようにする（SECURITY INVOKER）。
-- service role（管理用のスクリプト）からの INSERT はそのまま通す。

CREATE OR REPLACE FUNCTION public.enforce_report_insert_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    target_owner uuid;
BEGIN
    IF COALESCE(auth.role(), '') NOT IN ('anon', 'authenticated') THEN
        RETURN NEW;
    END IF;

    NEW.status := 'open';
    NEW.resolved_by := NULL;
    NEW.resolved_at := NULL;
    NEW.created_at := now();
    NEW.updated_at := now();

    IF NEW.target_type = 'post' THEN
        SELECT p.user_id INTO target_owner FROM public.posts AS p WHERE p.id = NEW.target_id;
    ELSIF NEW.target_type = 'user' THEN
        SELECT pr.id INTO target_owner FROM public.profiles AS pr WHERE pr.id = NEW.target_id;
    END IF;

    IF target_owner IS NULL THEN
        RAISE EXCEPTION 'report_target_not_found'
            USING ERRCODE = '23503',
                  HINT = '通報する投稿・ユーザーが見つかりません';
    END IF;

    NEW.target_user_id := target_owner;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_report_insert_defaults ON public.reports;
CREATE TRIGGER enforce_report_insert_defaults
    BEFORE INSERT ON public.reports
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_report_insert_defaults();
