-- profile-avatars ストレージバケットを作成（公開読み取り、2MB制限）
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'profile-avatars',
    'profile-avatars',
    true,
    2097152,
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- 公開読み取りポリシー
CREATE POLICY "profile-avatars are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'profile-avatars');

-- 認証済みユーザーのアップロードポリシー（自分のフォルダのみ）
CREATE POLICY "authenticated users can upload their own avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'profile-avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
);

-- 自分のアバターの上書きポリシー
CREATE POLICY "users can update their own avatar"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = 'profile-avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
);

-- 自分のアバターの削除ポリシー
CREATE POLICY "users can delete their own avatar"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'profile-avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
);
