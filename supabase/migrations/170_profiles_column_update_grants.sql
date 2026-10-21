-- ============================================================
-- 170_profiles_column_update_grants: プロフィールで直接更新できる列を絞る（#236 の後半）
-- ============================================================
-- profiles の UPDATE ポリシーは「自分の行」しか見ず、authenticated は全列を更新できた。そのため
-- ユーザー名の変更で求める現在のパスワードの確認は、Supabase の REST API を直接呼ぶと素通りできた。
--
-- authenticated が直接更新できるのは、アプリが本人の操作で書き換える列だけにする。
--   display_name, bio, avatar_url, header_url, list_is_public, is_private
-- username は、現在のパスワードを確かめた後にサーバーが service role で書き換える
-- （src/routes/settings/account/+page.server.ts、PR #467）。is_admin・setup_completed・created_at なども
-- 直接は変えられない。新規作成（INSERT）の権限は今どおり（初期設定で username を決めて作るため。
-- 169 の CHECK と 161 のトリガーが守る）。
--
-- このファイルを含む PR は、PR #467（username の書き換えを service role に移した版）が本番（master）に
-- リリースされた後に develop へマージし、すぐに db push すること。先に適用すると、旧アプリの
-- ユーザー名変更（利用者の権限で username を更新する）が権限エラーになる。
-- profiles を呼び出した人の権限（SECURITY INVOKER）で更新する DB 関数は無い（2026-10-21 確認）。

REVOKE UPDATE ON public.profiles FROM anon, authenticated;
GRANT UPDATE (display_name, bio, avatar_url, header_url, list_is_public, is_private) ON public.profiles TO authenticated;
