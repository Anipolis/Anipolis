-- ============================================================
-- 176_email_signup_uses_onboarding: メールの登録でもプロフィールは初期設定画面で作る
-- ============================================================
-- メールアドレスとパスワードの登録では、auth.users の作成時に handle_new_user が
-- 登録フォームで入れたユーザー名・表示名から profiles を作っていた（Discord・Google・X は 083 から
-- 作らずに初期設定画面 /onboarding へ回している）。
--
-- 登録フォームをメールアドレスとパスワードだけにし、ユーザー名・表示名・アイコンは
-- OAuth と同じ初期設定画面で決める形にそろえるため、トリガーと関数を消す。
-- profiles の無いログイン中の利用者は、アプリが /onboarding へ回す（+layout.server.ts）。
--
-- アプリより先に適用してよい: 古いアプリから登録された人もプロフィールが作られないだけで、
-- 初期設定画面でフォームに入れたユーザー名（user_metadata.user_name）が最初から入った状態になる。
-- 既存の利用者のプロフィールには影響しない。

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();
