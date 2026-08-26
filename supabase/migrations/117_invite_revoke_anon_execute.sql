-- 招待RPCから anon の EXECUTE を剥奪する（防御の多層化）。
--
-- Supabase の ALTER DEFAULT PRIVILEGES は新規関数の EXECUTE を PUBLIC ではなく
-- anon / authenticated / service_role の各ロールへ直接付与する。112 の
-- `REVOKE ALL ... FROM PUBLIC` ではこの直接付与は剥がれず、anon でも関数本体まで
-- 到達できていた（auth.uid() が NULL のため 'login required' で止まるが、
-- 意図した権限面とはズレている）。
--
-- check_invite_code は未ログインの招待リンク検証（/auth のプリフィル）で
-- anon から呼ぶ正当な経路があるため対象外。

REVOKE EXECUTE ON FUNCTION public.create_invite(integer, timestamptz) FROM anon;
REVOKE EXECUTE ON FUNCTION public.redeem_invite(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.revoke_invite(uuid) FROM anon;
