-- ================================================================
-- 197_post_created_at_server_time.sql
-- 投稿とリポストの日時は、サーバーの時刻で決める。
--
-- posts.created_at / reposts.created_at は DEFAULT now() だが、REST API に直接 INSERT すれば
-- 好きな日時を入れられた（147 のコメントにある通り）。タイムライン・トレンド・リポストの並びは
-- この日時の順なので、先の日時を入れた投稿はいつまでも先頭に残った。
--
-- 168（通報）・182（マイリスト）と同じく、アプリの利用者からの書き込みではトリガーで上書きする。
--   * INSERT は今の時刻にする。
--   * UPDATE で created_at を変えようとしても、前の値のままにする。
--   * service role（取り込みスクリプト・ステージングの seed）は、指定した日時をそのまま使える。
-- ================================================================

CREATE OR REPLACE FUNCTION public.keep_server_created_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
    IF COALESCE(auth.role(), '') NOT IN ('anon', 'authenticated') THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        NEW.created_at := now();
    ELSE
        NEW.created_at := OLD.created_at;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.keep_server_created_at() FROM PUBLIC;

DROP TRIGGER IF EXISTS keep_server_created_at ON public.posts;
CREATE TRIGGER keep_server_created_at
    BEFORE INSERT OR UPDATE OF created_at ON public.posts
    FOR EACH ROW EXECUTE FUNCTION public.keep_server_created_at();

DROP TRIGGER IF EXISTS keep_server_created_at ON public.reposts;
CREATE TRIGGER keep_server_created_at
    BEFORE INSERT OR UPDATE OF created_at ON public.reposts
    FOR EACH ROW EXECUTE FUNCTION public.keep_server_created_at();
