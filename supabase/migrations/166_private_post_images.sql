-- ============================================================
-- 166_private_post_images: 投稿画像を非公開にする（#316）
-- ============================================================
-- post-images は公開バケット（011）で、URL を知っていれば誰でも画像を取得できた。投稿本文は
-- 鍵アカウント・管理者非表示・BAN・ブロックで見えなくなるのに、以前に URL を控えた人は画像だけ
-- 見られ続けた。また「誰でも読める」SELECT ポリシーは、Storage の API でのフォルダ一覧にも効く。
--
-- バケットを非公開にし、公開の読み取りポリシーを外す。表示はアプリが行う。
--   * 閲覧できる投稿の画像にだけ、サーバー（service role）が期限付きの URL を発行してページに埋め込む
--     （enrichPostsWithCounts / src/lib/server/post-image-signing.ts）
--   * 外に出るリンク（OGP など）と投稿欄のプレビューは /api/media/post-images/<path> を使う。
--     アクセスのたびに閲覧権限を確かめ、その時点の期限付き URL へ転送する
-- 読み取りは本人のフォルダだけ許す（本人による削除・一覧に必要。他人のものは読めない）。
--
-- このファイルを含む PR は、上記のアプリの変更（PR #380）が本番（master）にリリースされた後に
-- develop へマージし、すぐに db push すること。先に適用すると、旧アプリが埋め込んでいる公開 URL が
-- すべて表示できなくなる。148（投稿に他人の画像を保存させない検査）が適用済みであることが前提。
-- 既存の画像の URL（image_urls の値）は識別子としてそのまま使うので、データの書き換えは要らない。

UPDATE storage.buckets SET public = false WHERE id = 'post-images';

DROP POLICY IF EXISTS "post-images are publicly accessible" ON storage.objects;

DROP POLICY IF EXISTS "users can read their own post images" ON storage.objects;
CREATE POLICY "users can read their own post images"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'post-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
);
