-- ================================================================
-- 196_anime_recommendation_validation_invoker.sql
-- おすすめの送信前の検査を、送る人の権限で行う。
--
-- validate_anime_recommendation は SECURITY DEFINER で相手のマイリストを読み、
-- 「相手はもう見ている」ときに専用のメッセージで止めていた。この検査は INSERT ポリシーより
-- 先に走るので、送れない人でも、メッセージの違いから相手のマイリスト（非公開のものを含む）に
-- その作品があるかを確かめられた。ログインしていない呼び出しでは auth.uid() が NULL になり、
-- 「送る人は本人であること」の検査（<> の比較）も素通りしていた。
--
--   * SECURITY INVOKER にする。相手のマイリストは、送る人が読める行だけを見る
--     （119 の SELECT ポリシー）。読めないリストの作品は、そのまま送れる。
--   * 本人確認は IS DISTINCT FROM で行い、ログインしていない呼び出しを止める。
--   * 1日3件までの検査は、送る人自身の行だけを数えるので、送る人の権限で読める。
--   * anon には書き込みの権限を持たせない（参加者しか読めず、書けるのは本人だけ）。
--
-- service role など、アプリの利用者以外からの INSERT では本人確認をしない（これまでと同じ）。
-- ================================================================

CREATE OR REPLACE FUNCTION public.validate_anime_recommendation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    recipient_status text;
    todays_count integer;
BEGIN
    IF COALESCE(auth.role(), '') IN ('anon', 'authenticated')
       AND (auth.uid() IS NULL OR NEW.recommender_id IS DISTINCT FROM auth.uid()) THEN
        RAISE EXCEPTION 'recommendations can only be sent by the current user'
            USING ERRCODE = '42501';
    END IF;

    SELECT status INTO recipient_status
    FROM public.user_anime_list
    WHERE user_id = NEW.recipient_id
      AND anime_id = NEW.anime_id;

    IF recipient_status IN ('watching', 'completed') THEN
        RAISE EXCEPTION 'recipient is already watching or completed this anime';
    END IF;

    SELECT count(*) INTO todays_count
    FROM public.anime_recommendations
    WHERE recommender_id = NEW.recommender_id
      AND recipient_id = NEW.recipient_id
      AND (created_at AT TIME ZONE 'Asia/Tokyo')::date = (now() AT TIME ZONE 'Asia/Tokyo')::date;

    IF todays_count >= 3 THEN
        RAISE EXCEPTION 'daily recommendation limit reached for this recipient';
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_anime_recommendation() FROM PUBLIC;

REVOKE INSERT, UPDATE, DELETE ON public.anime_recommendations FROM anon;
