-- ============================================================
-- 167_post_image_path_strict: 投稿画像の URL の形を厳密に検査する（#235）
-- ============================================================
-- 148 は「…/post-images/<user_id>/ を含み、.. を含まない」だけを見ていた。次の URL が通っていた。
--   * 外部のオリジン（https://evil.example/storage/v1/object/public/post-images/<user_id>/x.png）
--   * URL エンコードでの移動（<user_id>/%2e%2e/<他人の id>/x.png）。アプリはパスをデコードして使うので、
--     管理者削除（service role）が他人のフォルダの画像を消しにいく恐れがあった
--   * サブフォルダ・クエリ付きの URL
-- 保存できる形を、アップロード API（/api/upload）が返す URL そのものに限る。
--   https://<ref>.supabase.co/storage/v1/object/public/post-images/<user_id>/<時刻>-<uuid>.<拡張子>
-- アプリ側も同じ形を ownedPostImagePath（src/lib/post-image-url.ts）で検査する。
-- 表示はパスだけを取り出して自分のバケットで署名し直すので、オリジンは *.supabase.co の形までに留める
-- （本番とステージングでプロジェクトが違い、DB からは自分のプロジェクトの URL を知れないため）。
--   * 本番の既存データに違反は無い（2026-10-21 確認: 画像付き投稿3件・画像3枚とも新しい形に合う）

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
        WHERE image.url IS NULL
           OR image.url !~ (
                '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/post-images/'
                || NEW.user_id::text
                || '/[A-Za-z0-9_-][A-Za-z0-9._-]*$'
              )
           OR image.url LIKE '%..%'
    ) THEN
        RAISE EXCEPTION 'post_image_not_owned'
            USING ERRCODE = '22023',
                  HINT = '添付できるのは自分がアップロードした画像だけです';
    END IF;

    RETURN NEW;
END;
$$;
