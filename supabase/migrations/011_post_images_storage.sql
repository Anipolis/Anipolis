-- post-images ストレージバケットを作成（公開読み取り、5MB制限）
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'post-images',
    'post-images',
    true,
    5242880,
    ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- 公開読み取りポリシー
CREATE POLICY "post-images are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'post-images');

-- 認証済みユーザーのアップロードポリシー（自分のフォルダのみ）
CREATE POLICY "authenticated users can upload post images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'post-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
);

-- 自分の画像の削除ポリシー
CREATE POLICY "users can delete their own post images"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'post-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
);
