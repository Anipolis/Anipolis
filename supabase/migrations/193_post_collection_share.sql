-- ================================================================
-- 193_post_collection_share.sql
-- コレクションを投稿でシェアする。
--
-- 投稿にはコレクションの写しではなく参照（collection_id）だけを持たせる。
-- カードは表示のたびに今の中身から作るので、持ち主が非公開にしたり消したりすれば、
-- user_collections の RLS によって投稿からも見えなくなる（消したら参照は空になる）。
-- ================================================================

ALTER TABLE public.posts
ADD COLUMN IF NOT EXISTS collection_id uuid REFERENCES public.user_collections(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS posts_collection_id_idx ON public.posts (collection_id) WHERE collection_id IS NOT NULL;

-- シェアできるのは、投稿する本人の公開コレクションだけ（画面の「シェア」も公開のときだけ出す）。
-- 本文が空のときはアプリが「コレクションを共有しました」を入れるので、本文の検査（posts_content_check）は変えない。
-- 本文があれば、コレクションが消えて参照が空になっても投稿は検査を満たしたまま残る
CREATE OR REPLACE FUNCTION public.check_post_collection_share()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
    IF NEW.collection_id IS NULL THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.collection_id IS NOT DISTINCT FROM OLD.collection_id THEN
        RETURN NEW;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.user_collections c
        WHERE c.id = NEW.collection_id AND c.user_id = NEW.user_id AND c.is_public
    ) THEN
        RAISE EXCEPTION 'collection share not allowed'
            USING ERRCODE = '22023', HINT = 'シェアできるのは自分の公開コレクションだけです';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_post_collection_share ON public.posts;
CREATE TRIGGER check_post_collection_share
    BEFORE INSERT OR UPDATE OF collection_id ON public.posts
    FOR EACH ROW EXECUTE FUNCTION public.check_post_collection_share();

-- 投稿のカード用の要約（PostgREST の計算列。select で collection_preview と書いて取る）。
-- 呼んだ人の権限で読むので、作品の RLS（非公開・情報未整備の作品）もそのまま効く。
--   count: 作品の数
--   items: リスト・ランキングは先頭5作品、ティア表は上から3段までを各段8作品まで（段の順・並び順）
CREATE OR REPLACE FUNCTION public.collection_preview(c public.user_collections)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT jsonb_build_object(
        'count', (SELECT count(*) FROM public.user_collection_items i WHERE i.collection_id = c.id),
        'items', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object('id', p.anime_id, 'title', p.title, 'cover_url', p.cover_url, 'tier', p.tier)
                -- 段の順はティア表だけ。リスト・ランキングに変えても段の値は残るので、それ以外は並び順のまま
                ORDER BY CASE WHEN c.kind = 'tier' THEN p.tier END NULLS LAST, p.position
            )
            FROM (
                SELECT
                    i.anime_id,
                    i.position,
                    i.tier,
                    a.title,
                    a.cover_url,
                    row_number() OVER (ORDER BY i.position) AS rank_in_all,
                    row_number() OVER (PARTITION BY i.tier ORDER BY i.position) AS rank_in_tier
                FROM public.user_collection_items i
                JOIN public.anime a ON a.id = i.anime_id
                WHERE i.collection_id = c.id
            ) p
            WHERE CASE
                WHEN c.kind = 'tier' THEN p.tier IS NOT NULL AND p.tier < 3 AND p.rank_in_tier <= 8
                ELSE p.rank_in_all <= 5
            END
        ), '[]'::jsonb)
    );
$$;

REVOKE ALL ON FUNCTION public.collection_preview(public.user_collections) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.collection_preview(public.user_collections) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
