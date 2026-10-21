-- ヘッダー画像を本人が消せるようにする（カバー画像は管理者が消せるようにする）。
--
-- Storage は、削除や上書きの前に対象の行を SELECT で読めないと、エラーにせず 0 件として扱う。
-- 本番には profile-headers と anime-covers の SELECT ポリシーが無く（081・020 の
-- 「誰でも読める」ポリシーが入っていない。2026-10-17 に本番の定義を書き出して確認）、
-- ヘッダー画像を差し替えたり外したりしても古いファイルが消えず、URL で見え続けていた
-- （ステージングで本人の削除が 0 件になることを確認）。
--
-- 公開バケットなので、表示（公開 URL）に SELECT ポリシーは要らない。誰でも一覧できる
-- ポリシーは作らず、本人（カバーは管理者）だけが読めるようにする。
-- migration どおりに作った環境には 020・081 の「誰でも読める」ポリシーがあり、OR で効いて
-- 誰でも一覧できてしまうので消す（本番・ステージングにはもともと無いので変化なし）。

DROP POLICY IF EXISTS "anime-covers are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "profile headers are publicly accessible" ON storage.objects;

DROP POLICY IF EXISTS "users can read their own profile header" ON storage.objects;
CREATE POLICY "users can read their own profile header"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'profile-headers' AND (auth.uid())::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "admins can read anime covers" ON storage.objects;
CREATE POLICY "admins can read anime covers"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'anime-covers' AND public.is_current_user_admin());
