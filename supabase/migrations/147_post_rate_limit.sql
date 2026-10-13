-- ============================================================
-- 147_post_rate_limit: 投稿・返信の回数制限を DB で行う（#321）
-- ============================================================
-- 回数制限は hooks の `/api/` だけに掛かっていて、ホーム・ルーム・イベント・投稿詳細の
-- form action（?/createPost / ?/reply）は対象外だった。また Supabase の REST API に
-- ログイン中のトークンで直接 INSERT すれば、アプリの検査はどれも通らない。
--
-- 投稿の INSERT 直前に、同じユーザーの直近60秒の投稿数を数えて止める。
--   * すべての作成経路（アプリの各 action・/api/posts・REST の直接 INSERT）に同じ上限が効く。
--   * DB で数えるので、Workers の isolate ごとにメモリで数える制限（#241）と違い全体の上限になる。
--   * 上限は既存の /api/posts のルールと同じ 20件/60秒（実況中の連投を考えて3秒に1回ペース）。
--   * SQLSTATE を PT429 にすると PostgREST は HTTP 429 を返す。アプリはこのコードで判別する。
--   * service role（取り込みスクリプト等）や、本人以外を user_id にした INSERT（RLS で別途拒否）は数えない。
--   * 管理者が非表示にした自分の投稿も数えるよう、SECURITY DEFINER で RLS を越えて数える。
--     使うのは posts_user_created_idx（082）。

CREATE OR REPLACE FUNCTION public.enforce_post_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    recent_count integer;
BEGIN
    IF auth.uid() IS NULL OR NEW.user_id IS DISTINCT FROM auth.uid() THEN
        RETURN NEW;
    END IF;

    SELECT count(*)
    INTO recent_count
    FROM public.posts p
    WHERE p.user_id = NEW.user_id
      AND p.created_at > now() - interval '60 seconds';

    IF recent_count >= 20 THEN
        RAISE EXCEPTION 'post_rate_limited'
            USING ERRCODE = 'PT429',
                  HINT = '投稿が多すぎます。しばらく待ってから投稿してください';
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_post_rate_limit() FROM PUBLIC;

DROP TRIGGER IF EXISTS enforce_post_rate_limit ON public.posts;
CREATE TRIGGER enforce_post_rate_limit
    BEFORE INSERT ON public.posts
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_post_rate_limit();
