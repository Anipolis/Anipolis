-- ============================================================
-- 147_post_rate_limit: 投稿・返信の回数制限を DB で行う（#321）
-- ============================================================
-- 回数制限は hooks の `/api/` だけに掛かっていて、ホーム・ルーム・イベント・投稿詳細の
-- form action（?/createPost / ?/reply）は対象外だった。また Supabase の REST API に
-- ログイン中のトークンで直接 INSERT すれば、アプリの検査はどれも通らない。
--
-- 投稿の INSERT 直前に、利用者ごとのカウンターで作成回数を数えて止める。
--   * すべての作成経路（アプリの各 action・/api/posts・REST の直接 INSERT）に同じ上限が効く。
--   * DB で数えるので、Workers の isolate ごとにメモリで数える制限（#241）と違い全体の上限になる。
--   * 上限は既存の /api/posts のルールと同じ 20件/60秒（実況中の連投を考えて3秒に1回ペース）。
--   * SQLSTATE を PT429 にすると PostgREST は HTTP 429 を返す。アプリはこのコードで判別する。
--   * service role（取り込みスクリプト等）や、本人以外を user_id にした INSERT（RLS で別途拒否）は数えない。
--
-- 投稿の行そのものは数えない（PR #374 レビュー）。
--   * REST の直接 INSERT では created_at を指定できるので、過去の日時を付けると数から外れる。
--   * 本人は自分の投稿を削除できるので、作成と削除を繰り返すと数が減る。
-- 代わりに、利用者が読み書きできないカウンター表で、作成の回数だけを DB の時刻（now()）で数える。
--
-- 同時の投稿で上限を越えないよう、カウンターは1文の INSERT ... ON CONFLICT DO UPDATE で増やす。
-- 同じ利用者の行は行ロックで直列化され、後の文は先の文がコミットした後の値に対して更新・判定する
-- （Read Committed の ON CONFLICT DO UPDATE は最新の行に対して実行される）。
-- 上限を越えた INSERT は例外で取り消され、カウンターの増加も一緒に取り消される。
--
-- 区切りは「区切りの最初の投稿から60秒」の固定窓。区切りの境目をまたぐと短い間に最大40件まで
-- 通りうるが、連投・スパムを止める目的には十分で、表は利用者1人1行で増えない。

CREATE TABLE IF NOT EXISTS public.post_rate_limits (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    window_started_at timestamptz NOT NULL,
    post_count integer NOT NULL
);

-- 読み書きはトリガー（SECURITY DEFINER）だけ。利用者からは見えず、変更もできない
ALTER TABLE public.post_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.post_rate_limits FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.enforce_post_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_count integer;
BEGIN
    IF auth.uid() IS NULL OR NEW.user_id IS DISTINCT FROM auth.uid() THEN
        RETURN NEW;
    END IF;

    INSERT INTO public.post_rate_limits AS r (user_id, window_started_at, post_count)
    VALUES (NEW.user_id, now(), 1)
    ON CONFLICT (user_id) DO UPDATE
        SET window_started_at = CASE
                WHEN r.window_started_at <= now() - interval '60 seconds' THEN now()
                ELSE r.window_started_at
            END,
            post_count = CASE
                WHEN r.window_started_at <= now() - interval '60 seconds' THEN 1
                ELSE r.post_count + 1
            END
    RETURNING r.post_count INTO current_count;

    IF current_count > 20 THEN
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
