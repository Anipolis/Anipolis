-- anime-covers バケットへの書き込みを管理者だけに戻す（025 のやり直し）。
--
-- 025 は記録上は適用済みだが、本番には 020 の「ログイン中なら誰でも」のポリシーが残り、
-- 管理者用のポリシーは無かった（2026-10-17 に本番の定義を書き出して確認。083 と同じ状態）。
-- そのため、ログインできる人なら誰でもカバー画像を上書き・削除できた。
-- どちらの状態からでも同じ結果になるよう、両方の名前を消してから作り直す。
-- 取り込みスクリプトは secret key（RLS を通らない）なので影響しない。

DROP POLICY IF EXISTS "authenticated users can upload anime covers" ON storage.objects;
DROP POLICY IF EXISTS "authenticated users can update anime covers" ON storage.objects;
DROP POLICY IF EXISTS "authenticated users can delete anime covers" ON storage.objects;
DROP POLICY IF EXISTS "admins can upload anime covers" ON storage.objects;
DROP POLICY IF EXISTS "admins can update anime covers" ON storage.objects;
DROP POLICY IF EXISTS "admins can delete anime covers" ON storage.objects;

CREATE POLICY "admins can upload anime covers"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'anime-covers' AND public.is_current_user_admin());

CREATE POLICY "admins can update anime covers"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'anime-covers' AND public.is_current_user_admin())
WITH CHECK (bucket_id = 'anime-covers' AND public.is_current_user_admin());

CREATE POLICY "admins can delete anime covers"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'anime-covers' AND public.is_current_user_admin());
