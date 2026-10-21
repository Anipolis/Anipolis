-- ============================================================
-- 148_post_image_ownership: 投稿に他人の画像を参照させない（#316 / #235）
-- ============================================================
-- 投稿の image_urls は、アプリの投稿処理（insertPostWithHashtags）では自分のフォルダの画像だけに
-- 限っているが、DB では検査していなかった。Supabase の REST API に直接 INSERT すれば、以前に知った
-- 他人の画像の URL を自分の投稿に保存できる（PR #380 レビュー）。
--
-- 投稿画像を期限付き URL で配信する仕組み（#316）は「閲覧できる投稿に使われている画像」を許すので、
-- 他人の画像を参照する投稿を作れると、元の投稿が鍵化・非表示になっても画像を取り続けられてしまう。
-- 保存時に、すべての画像が投稿者のフォルダ（post-images/<user_id>/…）にあることを検査する。
--   * 本番の既存データに違反は無い（2026-10-13 確認: 画像付き投稿3件・画像3枚とも本人のもの）
--   * 配信側（enrichPostsWithCounts / /api/media）でも投稿者と画像の持ち主の一致を確かめる（多重の防御）
--   * PostgREST は SQLSTATE 22023（invalid_parameter_value）を 400 にする

CREATE OR REPLACE FUNCTION public.enforce_post_image_ownership()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NEW.image_urls IS NULL OR cardinality(NEW.image_urls) = 0 THEN
        RETURN NEW;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM unnest(NEW.image_urls) AS image(url)
        WHERE image.url NOT LIKE '%/storage/v1/object/public/post-images/' || NEW.user_id::text || '/%'
           OR image.url LIKE '%..%'
    ) THEN
        RAISE EXCEPTION 'post_image_not_owned'
            USING ERRCODE = '22023',
                  HINT = '添付できるのは自分がアップロードした画像だけです';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_post_image_ownership ON public.posts;
CREATE TRIGGER enforce_post_image_ownership
    BEFORE INSERT OR UPDATE OF image_urls, user_id ON public.posts
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_post_image_ownership();
