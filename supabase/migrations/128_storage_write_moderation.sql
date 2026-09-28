-- ============================================================
-- 128_storage_write_moderation: 利用制限・BAN中のアカウントの画像アップロードを塞ぐ
-- ============================================================
-- 118 で Storage の書き込みポリシーに β 検査を追加したが、posts 等の書き込み
-- ポリシーにある利用制限（account_moderation）検査が含まれていなかった。
-- そのため restricted / banned のアカウントも Storage API を直接呼べば
-- post-images / profile-avatars / profile-headers に画像を置けた（Issue #31）。
--
-- 118 の5ポリシーを同じ条件で作り直し、is_profile_active_for_writes(auth.uid())
-- を追加する。制限期限を過ぎた restricted は書き込み可とする扱いは posts と同じ。
-- 削除（DELETE）ポリシーは対象外: 制限中でも自分の画像を消せる方が安全なため。

DROP POLICY IF EXISTS "authenticated users can upload post images" ON storage.objects;
CREATE POLICY "authenticated users can upload post images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'post-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
    AND public.has_beta_write_access()
    AND public.is_profile_active_for_writes(auth.uid())
);

DROP POLICY IF EXISTS "authenticated users can upload their own avatar" ON storage.objects;
CREATE POLICY "authenticated users can upload their own avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'profile-avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
    AND public.has_beta_write_access()
    AND public.is_profile_active_for_writes(auth.uid())
);

DROP POLICY IF EXISTS "users can update their own avatar" ON storage.objects;
CREATE POLICY "users can update their own avatar"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = 'profile-avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
    AND public.has_beta_write_access()
    AND public.is_profile_active_for_writes(auth.uid())
);

DROP POLICY IF EXISTS "users can upload their own profile header" ON storage.objects;
CREATE POLICY "users can upload their own profile header"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'profile-headers'
    AND auth.uid()::text = (storage.foldername(name))[1]
    AND public.has_beta_write_access()
    AND public.is_profile_active_for_writes(auth.uid())
);

DROP POLICY IF EXISTS "users can update their own profile header" ON storage.objects;
CREATE POLICY "users can update their own profile header"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = 'profile-headers'
    AND auth.uid()::text = (storage.foldername(name))[1]
    AND public.has_beta_write_access()
    AND public.is_profile_active_for_writes(auth.uid())
);
