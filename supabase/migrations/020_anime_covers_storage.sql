-- anime-covers ストレージバケットを作成（公開読み取り、10MB制限）
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'anime-covers',
    'anime-covers',
    true,
    10485760,
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- 公開読み取りポリシー
CREATE POLICY "anime-covers are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'anime-covers');

-- 認証済みユーザーのアップロードポリシー（サーバー側で管理者チェック）
CREATE POLICY "authenticated users can upload anime covers"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'anime-covers');

-- 認証済みユーザーの上書き更新ポリシー
CREATE POLICY "authenticated users can update anime covers"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'anime-covers');

-- 認証済みユーザーの削除ポリシー
CREATE POLICY "authenticated users can delete anime covers"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'anime-covers');
